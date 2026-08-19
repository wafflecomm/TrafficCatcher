"""Traffic Catcher 네이버 블로그 로컬 발행 도우미.

원고를 로컬 SQLite에 보관하고 네이버 블로그 글쓰기 화면을 연다.
최종 발행은 사용자가 네이버 편집기에서 직접 수행한다.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, request


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / ".naver_blog_helper.db"
DEFAULT_PORT = 8765
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5001",
    "http://localhost:5001",
    "https://trafficcatcher.pages.dev",
}


app = Flask(__name__)


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db():
    with connect_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS naver_blog_drafts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body_markdown TEXT NOT NULL,
                tags_json TEXT NOT NULL DEFAULT '[]',
                category TEXT NOT NULL DEFAULT '',
                source_urls_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'waiting',
                published_url TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def serialize_draft(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "body_markdown": row["body_markdown"],
        "tags": json.loads(row["tags_json"] or "[]"),
        "category": row["category"],
        "source_urls": json.loads(row["source_urls_json"] or "[]"),
        "status": row["status"],
        "published_url": row["published_url"],
        "error_message": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_draft_or_none(draft_id):
    with connect_db() as connection:
        return connection.execute(
            "SELECT * FROM naver_blog_drafts WHERE id = ?", (draft_id,)
        ).fetchone()


def clean_list(value, limit=30):
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:500] for item in value[:limit] if str(item).strip()]


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.before_request
def protect_local_helper():
    if request.method == "OPTIONS":
        return ("", 204)
    origin = request.headers.get("Origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        app.logger.warning("Blocked request origin: %s", origin)
        return jsonify({"status": "error", "message": "허용되지 않은 웹 페이지 요청입니다."}), 403


@app.get("/health")
def health():
    return jsonify({
        "status": "success",
        "service": "traffic-catcher-naver-blog-helper",
        "version": "0.1.0",
        "message": "네이버 블로그 로컬 도우미가 연결되었습니다.",
    })


@app.post("/drafts")
def create_draft():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()[:200]
    body = str(payload.get("body_markdown", "")).strip()
    if not title:
        return jsonify({"status": "error", "message": "제목이 없습니다."}), 400
    if len(body) < 30:
        return jsonify({"status": "error", "message": "본문이 너무 짧습니다."}), 400
    if len(body) > 200_000:
        return jsonify({"status": "error", "message": "본문 길이가 허용 범위를 초과했습니다."}), 413

    draft_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    tags = clean_list(payload.get("tags"), 30)
    sources = clean_list(payload.get("source_urls"), 30)
    category = str(payload.get("category", "")).strip()[:100]
    with connect_db() as connection:
        connection.execute(
            """
            INSERT INTO naver_blog_drafts
            (id, title, body_markdown, tags_json, category, source_urls_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (draft_id, title, body, json.dumps(tags, ensure_ascii=False), category,
             json.dumps(sources, ensure_ascii=False), now, now),
        )
    return jsonify({"status": "success", "draft": serialize_draft(get_draft_or_none(draft_id))}), 201


@app.get("/drafts")
def list_drafts():
    """최근 저장 원고를 최신순으로 반환한다."""
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 200))
    except (TypeError, ValueError):
        limit = 100
    with connect_db() as connection:
        rows = connection.execute(
            """
            SELECT id, title, tags_json, category, status, published_url,
                   error_message, created_at, updated_at, length(body_markdown) AS body_length
            FROM naver_blog_drafts
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    drafts = [{
        "id": row["id"],
        "title": row["title"],
        "tags": json.loads(row["tags_json"] or "[]"),
        "category": row["category"],
        "status": row["status"],
        "published_url": row["published_url"],
        "error_message": row["error_message"],
        "body_length": row["body_length"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    } for row in rows]
    return jsonify({"status": "success", "count": len(drafts), "drafts": drafts})


@app.get("/drafts/<draft_id>")
def get_draft(draft_id):
    row = get_draft_or_none(draft_id)
    if row is None:
        return jsonify({"status": "error", "message": "원고를 찾을 수 없습니다."}), 404
    return jsonify({"status": "success", "draft": serialize_draft(row)})


@app.post("/drafts/<draft_id>/open")
def open_naver_editor(draft_id):
    row = get_draft_or_none(draft_id)
    if row is None:
        return jsonify({"status": "error", "message": "원고를 찾을 수 없습니다."}), 404
    payload = request.get_json(silent=True) or {}
    should_open_browser = payload.get("open_browser", True) is not False
    opened = webbrowser.open("https://blog.naver.com/GoBlogWrite.naver", new=2) if should_open_browser else True
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as connection:
        connection.execute(
            "UPDATE naver_blog_drafts SET status = ?, updated_at = ? WHERE id = ?",
            ("review_waiting", now, draft_id),
        )
    return jsonify({
        "status": "success",
        "opened": bool(opened),
        "opened_by": "local_helper" if should_open_browser else "web_page",
        "message": "네이버 글쓰기 화면을 열었습니다. 원고를 붙여넣고 최종 발행해 주세요.",
    })


@app.post("/drafts/<draft_id>/confirm")
def confirm_publish(draft_id):
    if get_draft_or_none(draft_id) is None:
        return jsonify({"status": "error", "message": "원고를 찾을 수 없습니다."}), 404
    payload = request.get_json(silent=True) or {}
    published_url = str(payload.get("published_url", "")).strip()[:1000]
    if published_url and not published_url.startswith(("https://blog.naver.com/", "http://blog.naver.com/")):
        return jsonify({"status": "error", "message": "네이버 블로그 URL을 입력해 주세요."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as connection:
        connection.execute(
            "UPDATE naver_blog_drafts SET status = ?, published_url = ?, updated_at = ? WHERE id = ?",
            ("published", published_url, now, draft_id),
        )
    return jsonify({"status": "success", "draft": serialize_draft(get_draft_or_none(draft_id))})


def main():
    parser = argparse.ArgumentParser(description="Traffic Catcher 네이버 블로그 로컬 발행 도우미")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    initialize_db()
    print("=" * 58)
    print(" Traffic Catcher 네이버 블로그 로컬 도우미")
    print(f" 연결 주소: http://127.0.0.1:{args.port}")
    print(" 최종 발행 버튼은 네이버 편집기에서 직접 눌러 주세요.")
    print("=" * 58)
    app.run(host="127.0.0.1", port=args.port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
