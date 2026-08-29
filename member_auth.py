"""Traffic Catcher 이메일 OTP 회원 인증(로컬 Flask + SQLite)."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from flask import Blueprint, jsonify, make_response, request


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUTH_DB_FILE = os.path.join(BASE_DIR, ".traffic_catcher_members.db")
AUTH_SCHEMA_FILE = os.path.join(BASE_DIR, "auth_schema.sql")
AUTH_COOKIE_NAME = "tc_session"
OTP_TTL_SECONDS = 300
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
AUTH_SESSION_DAYS = 30

DEFAULT_AI_INSTRUCTION_SECTIONS = {
    "absolute": True,
    "selected": True,
    "persona": True,
    "conflict": True,
}

DEFAULT_AI_MODEL_CATALOG = [
    {"value": "gemini-3.1-flash-lite", "label": "라이트 · Flash Lite 3.1", "tier": "starter", "title": "비용과 응답 속도를 우선하는 간단한 글쓰기", "enabled": True, "badge": ""},
    {"value": "gemini-3.5-flash-lite", "label": "고속 · Flash Lite 3.5", "tier": "starter", "title": "빠른 초안과 대량 글쓰기에 적합", "enabled": True, "badge": "추천"},
    {"value": "gemini-3.5-flash", "label": "균형 · Flash 3.5", "tier": "standard", "title": "속도와 글 품질의 균형", "enabled": True, "badge": ""},
    {"value": "gemini-3.6-flash", "label": "고품질 · Flash 3.6", "tier": "standard", "title": "더 정교한 구성과 표현", "enabled": True, "badge": ""},
    {"value": "gemini-3.7-flash", "label": "최신 · Flash 3.7", "tier": "premium", "title": "최신 고성능 Flash 글쓰기", "enabled": True, "badge": "응답 지연 가능"},
    {"value": "gemini-3.1-pro-preview", "label": "전문가 · Pro 3.1 Preview", "tier": "premium", "title": "복잡한 분석과 전문 원고용 Preview 모델", "enabled": True, "badge": "응답속도 느림"},
]


def normalize_ai_model_catalog(value=None, include_hidden=True):
    """Merge stored visibility/badges onto the server-controlled model allowlist."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            value = []
    saved = {str(item.get("value") or ""): item for item in value if isinstance(item, dict)} if isinstance(value, list) else {}
    catalog = []
    for default in DEFAULT_AI_MODEL_CATALOG:
        override = saved.get(default["value"], {})
        item = dict(default)
        item["enabled"] = bool(override.get("enabled", default["enabled"]))
        item["badge"] = re.sub(r"\s+", " ", str(override.get("badge", default["badge"]) or "").strip())[:20]
        catalog.append(item)
    if not any(item["enabled"] for item in catalog):
        catalog[1]["enabled"] = True
    return catalog if include_hidden else [item for item in catalog if item["enabled"]]


def get_ai_model_catalog(include_hidden=False):
    return normalize_ai_model_catalog(get_service_setting("ai_model_catalog", ""), include_hidden)

auth_blueprint = Blueprint("member_auth", __name__, url_prefix="/api/auth")
admin_blueprint = Blueprint("member_admin", __name__, url_prefix="/api/admin")


def _normalize_ai_instruction_sections(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            value = {}
    value = value if isinstance(value, dict) else {}
    return {key: bool(value.get(key, enabled)) for key, enabled in DEFAULT_AI_INSTRUCTION_SECTIONS.items()}


def get_user_ai_instruction_sections(user):
    """Return the current user's AI instruction inclusion policy."""
    if not user:
        return dict(DEFAULT_AI_INSTRUCTION_SECTIONS)
    user_id = user["id"] if not isinstance(user, str) else user
    with _db() as connection:
        row = connection.execute(
            "SELECT absolute, selected, persona, conflict FROM user_ai_instruction_sections WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return _normalize_ai_instruction_sections(dict(row) if row else None)


def get_user_system_instruction(user, instruction_type="keyword"):
    """Return the latest DB-backed personal instruction for one writing mode."""
    if not user:
        return ""
    normalized_type = "story" if str(instruction_type or "").strip() == "story" else "keyword"
    user_id = user["id"] if not isinstance(user, str) else user
    with _db() as connection:
        row = connection.execute(
            "SELECT instruction FROM user_ai_instructions WHERE user_id = ? AND instruction_type = ?",
            (user_id, normalized_type),
        ).fetchone()
    return str(row["instruction"] if row else "").strip()


def get_service_setting(setting_key, default_value=""):
    """Return one shared service setting used by both local routes and admin APIs."""
    key = str(setting_key or "").strip()
    if not key:
        return default_value
    with _db() as connection:
        row = connection.execute(
            "SELECT setting_value FROM service_settings WHERE setting_key = ?",
            (key,),
        ).fetchone()
    return row["setting_value"] if row and row["setting_value"] is not None else default_value


def _utc_now():
    return datetime.now(timezone.utc)


def _iso_utc(value=None):
    return (value or _utc_now()).replace(microsecond=0).isoformat()


def _normalize_email(value):
    email = str(value or "").strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("올바른 이메일 주소를 입력해 주세요.")
    return email


def _normalize_nickname(value):
    nickname = re.sub(r"\s+", " ", str(value or "").strip())
    if not 2 <= len(nickname) <= 30:
        raise ValueError("닉네임은 2~30자로 입력해 주세요.")
    return nickname


def _auth_secret():
    return os.environ.get(
        "TRAFFIC_CATCHER_AUTH_SECRET",
        "traffic-catcher-local-development-secret",
    ).strip()


def _auth_hash(*parts):
    message = "|".join(str(part) for part in parts).encode("utf-8")
    return hmac.new(_auth_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


@contextmanager
def _db():
    connection = sqlite3.connect(AUTH_DB_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with open(AUTH_SCHEMA_FILE, "r", encoding="utf-8") as schema_file:
            connection.executescript(schema_file.read())
        preference_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(user_ai_preferences)").fetchall()
        }
        if "enabled" not in preference_columns:
            connection.execute("ALTER TABLE user_ai_preferences ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1")
        if "category_group" not in preference_columns:
            connection.execute("ALTER TABLE user_ai_preferences ADD COLUMN category_group TEXT NOT NULL DEFAULT '생활·노하우·쇼핑'")
        integration_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(user_integration_preferences)").fetchall()
        }
        if "naver_blog_open_enabled" not in integration_columns:
            connection.execute(
                "ALTER TABLE user_integration_preferences ADD COLUMN naver_blog_open_enabled INTEGER NOT NULL DEFAULT 1"
            )
        ui_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(user_ui_preferences)").fetchall()
        }
        if "theme_mode" not in ui_columns:
            connection.execute(
                "ALTER TABLE user_ui_preferences ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system'"
            )
        usage_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(ai_writing_usage_logs)").fetchall()
        }
        if "credit_refunded" not in usage_columns:
            connection.execute(
                "ALTER TABLE ai_writing_usage_logs ADD COLUMN credit_refunded INTEGER NOT NULL DEFAULT 0"
            )
        connection.execute(
            """INSERT OR IGNORE INTO ai_writing_usage_logs
               (id,user_id,operation,writing_mode,model,status,execution_type,source_kind,input_chars,output_chars,
                duration_ms,usage_units,credit_charged,credit_refunded,error_code,provider_job_id,
                created_at,completed_at,updated_at,retention_until)
               SELECT 'legacy:' || id,user_id,'article','keyword',model,status,'cloud_background','unknown',0,0,0,1,
                      credit_reserved,credit_refunded,'',id,created_at,
                      CASE WHEN lower(status) IN ('completed','failed','cancelled','canceled','incomplete','budget_exceeded','timed_out') THEN updated_at ELSE NULL END,
                      updated_at,strftime('%Y-%m-%dT%H:%M:%SZ',created_at,'+400 days')
               FROM ai_background_jobs"""
        )
        connection.execute("DELETE FROM ai_writing_usage_logs WHERE retention_until < ?", (_iso_utc(),))
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _send_otp_email(email, otp):
    smtp_host = os.environ.get("TRAFFIC_CATCHER_SMTP_HOST", "").strip()
    if not smtp_host:
        print(f"[개발용 이메일 OTP] {email}: {otp}")
        return "console"

    smtp_port = int(os.environ.get("TRAFFIC_CATCHER_SMTP_PORT", "587"))
    smtp_user = os.environ.get("TRAFFIC_CATCHER_SMTP_USER", "").strip()
    smtp_password = os.environ.get("TRAFFIC_CATCHER_SMTP_PASSWORD", "")
    from_email = os.environ.get("TRAFFIC_CATCHER_OTP_FROM_EMAIL", smtp_user).strip()
    if not from_email:
        raise RuntimeError("OTP 발신 이메일 설정이 없습니다.")

    subject = "[트래픽캐쳐 | Traffic Catcher] 로그인 인증번호가 발송되었습니다."
    text_body = (
        "안녕하세요, 트래픽캐쳐(Traffic Catcher) 입니다.\n\n"
        "계정 보호를 위해 요청하신 로그인 인증번호를 안내해 드립니다.\n\n"
        f"인증번호: {otp}\n"
        "유효시간: 발송 후 5분 이내\n\n"
        "인증번호는 타인에게 절대로 알려주지 마세요. 본인이 요청하지 않은 경우, "
        "이 메일을 무시하시고 계정 보안을 점검해 주시기 바랍니다.\n\n"
        "트래픽캐쳐 | Traffic Catcher"
    )
    html_body = f'''<!doctype html>
<html lang="ko"><body style="margin:0;padding:0;background:#f8fafc;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <div style="padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">안녕하세요, <strong>트래픽캐쳐(Traffic Catcher)</strong> 입니다.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">계정 보호를 위해 요청하신 로그인 인증번호를 안내해 드립니다.</p>
    <div style="margin:0 0 24px;padding:20px;border-radius:12px;background:#eff6ff;">
      <p style="margin:0 0 10px;font-size:15px;"><strong>인증번호:</strong> <span style="font-size:24px;font-weight:700;letter-spacing:4px;color:#2563eb;">{otp}</span></p>
      <p style="margin:0;font-size:15px;"><strong>유효시간:</strong> 발송 후 5분 이내</p>
    </div>
    <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#64748b;">인증번호는 타인에게 절대로 알려주지 마세요. 본인이 요청하지 않은 경우, 이 메일을 무시하시고 계정 보안을 점검해 주시기 바랍니다.</p>
    <p style="margin:0;font-size:14px;font-weight:600;color:#475569;">트래픽캐쳐 | Traffic Catcher</p>
  </div>
</div></body></html>'''

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_email
    message["To"] = email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as client:
        client.ehlo()
        if os.environ.get("TRAFFIC_CATCHER_SMTP_TLS", "1") != "0":
            client.starttls()
            client.ehlo()
        if smtp_user:
            client.login(smtp_user, smtp_password)
        client.send_message(message)
    return "email"


def _serialize_user(row):
    return {
        "id": row["id"],
        "email": row["email"],
        "nickname": row["nickname"],
        "role": row["role"],
        "email_verified_at": row["email_verified_at"],
    }


def _permissions_for_role(role):
    with _db() as connection:
        rows = connection.execute(
            "SELECT feature_key, enabled FROM role_feature_permissions WHERE role = ?", (role,),
        ).fetchall()
    return {row["feature_key"]: bool(row["enabled"]) for row in rows}


def _has_feature(user, feature_key):
    return bool(user) and _permissions_for_role(user["role"]).get(feature_key, False)


def _current_session():
    token = request.cookies.get(AUTH_COOKIE_NAME, "")
    if not token:
        return None
    now = _iso_utc()
    with _db() as connection:
        row = connection.execute(
            """
            SELECT u.id, u.email, u.nickname, u.role, u.email_verified_at,
                   s.id AS session_id
            FROM auth_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
              AND s.expires_at > ? AND u.status = 'active'
            """,
            (_auth_hash("session", token), now),
        ).fetchone()
        if row:
            connection.execute(
                "UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?",
                (now, row["session_id"]),
            )
        return row


def get_current_user():
    """현재 활성 세션 사용자. 페이지 라우트에서도 같은 서버 검증을 사용한다."""
    return _current_session()


def has_feature_permission(user, feature_key):
    """현재 사용자 역할에 특정 기능 권한이 활성화되어 있는지 확인한다."""
    return _has_feature(user, feature_key)


def get_writing_credit_status(user):
    """AI 글쓰기 잔여량. 유료·운영 역할은 현재 정책상 무제한이다."""
    if not user:
        return {"unlimited": False, "balance": 0, "earned_total": 0, "used_total": 0}
    if user["role"] in {"premium", "operator", "admin"}:
        return {"unlimited": True, "balance": None, "earned_total": 0, "used_total": 0}
    with _db() as connection:
        row = connection.execute(
            "SELECT balance, earned_total, used_total FROM user_writing_credits WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
    return {
        "unlimited": False,
        "balance": int(row["balance"]) if row else 0,
        "earned_total": int(row["earned_total"]) if row else 0,
        "used_total": int(row["used_total"]) if row else 0,
    }


def consume_writing_credit(user):
    """성공한 AI 글쓰기 1건을 원자적으로 차감한다."""
    status = get_writing_credit_status(user)
    if status["unlimited"]:
        return status
    now = _iso_utc()
    with _db() as connection:
        cursor = connection.execute(
            """UPDATE user_writing_credits SET balance=balance-1, used_total=used_total+1, updated_at=?
               WHERE user_id=? AND balance > 0""",
            (now, user["id"]),
        )
        if cursor.rowcount != 1:
            raise ValueError("AI 글쓰기 쿠폰이 부족합니다.")
        row = connection.execute(
            "SELECT balance, earned_total, used_total FROM user_writing_credits WHERE user_id=?", (user["id"],),
        ).fetchone()
    return {"unlimited": False, "balance": int(row["balance"]), "earned_total": int(row["earned_total"]), "used_total": int(row["used_total"])}


def refund_writing_credit(user):
    """생성 실패로 예약된 AI 글쓰기 1건을 복구한다."""
    if not user or user["role"] in {"premium", "operator", "admin"}:
        return
    with _db() as connection:
        connection.execute(
            """UPDATE user_writing_credits SET balance=balance+1,
               used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=?
               WHERE user_id=?""",
            (_iso_utc(), user["id"]),
        )


def start_writing_usage_log(user, model, writing_mode="keyword", operation="article",
                            execution_type="local_server", source_kind="keyword_only",
                            input_chars=0, credit_charged=False):
    """글 내용은 저장하지 않고 과금·품질 운영에 필요한 실행 메타데이터만 기록한다."""
    if not user:
        return None
    log_id = str(uuid.uuid4())
    now = _iso_utc()
    retention_until = _iso_utc(_utc_now() + timedelta(days=400))
    operation = operation if operation in {"article", "revision"} else "article"
    writing_mode = writing_mode if writing_mode in {"keyword", "story"} else "keyword"
    execution_type = execution_type if execution_type in {"local_server", "cloud_direct", "cloud_relay", "cloud_background"} else "local_server"
    source_kind = source_kind if source_kind in {"keyword_only", "news", "youtube", "story", "revision", "unknown"} else "unknown"
    with _db() as connection:
        connection.execute(
            """INSERT INTO ai_writing_usage_logs
               (id,user_id,operation,writing_mode,model,status,execution_type,source_kind,input_chars,
                output_chars,duration_ms,usage_units,credit_charged,credit_refunded,error_code,provider_job_id,
                created_at,completed_at,updated_at,retention_until)
               VALUES (?,?,?,?,?,'in_progress',?,?,?,0,0,1,?,0,'',NULL,?,NULL,?,?)""",
            (log_id, user["id"], operation, writing_mode, str(model or "AI 모델")[:80],
             execution_type, source_kind, max(0, int(input_chars or 0)), 1 if credit_charged else 0,
             now, now, retention_until),
        )
    return log_id


def finish_writing_usage_log(log_id, status, output_chars=0, duration_ms=0, error_code="", credit_refunded=False):
    """사용내역을 완료한다. 오류 원문 대신 분류 코드만 저장한다."""
    if not log_id:
        return
    normalized_status = status if status in {"completed", "failed", "cancelled", "timed_out"} else "failed"
    normalized_error = re.sub(r"[^A-Z0-9_]", "", str(error_code or "").upper())[:40]
    now = _iso_utc()
    with _db() as connection:
        connection.execute(
            """UPDATE ai_writing_usage_logs
               SET status=?,output_chars=?,duration_ms=?,error_code=?,
                   credit_refunded=CASE WHEN ? THEN 1 ELSE credit_refunded END,completed_at=?,updated_at=?
               WHERE id=?""",
            (normalized_status, max(0, int(output_chars or 0)), max(0, int(duration_ms or 0)),
             normalized_error, 1 if credit_refunded else 0, now, now, log_id),
        )


def _admin_user():
    user = _current_session()
    return user if user and user["role"] == "admin" else None


def _same_origin():
    origin = request.headers.get("Origin")
    return not origin or origin.rstrip("/") == request.host_url.rstrip("/")


def _admin_error():
    return jsonify({"status": "error", "message": "관리자 권한이 필요합니다."}), 403


@admin_blueprint.route("/ai-routing", methods=["GET", "PATCH"])
def admin_ai_routing():
    admin = _admin_user()
    if not admin:
        return _admin_error()
    relay_url = os.environ.get("KOREA_AI_PROXY_URL", "").strip()
    relay_token = os.environ.get("KOREA_AI_PROXY_KEY", "").strip()
    relay_secure = relay_url.lower().startswith("https://")
    insecure_allowed = os.environ.get("KOREA_AI_PROXY_ALLOW_INSECURE", "").strip().lower() == "true"
    relay_configured = (relay_secure or (insecure_allowed and relay_url.lower().startswith("http://"))) and len(relay_token) >= 32
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='ai_route'"
            ).fetchone()
        return jsonify({
            "status": "success",
            "mode": "korea_relay" if row and row["setting_value"] == "korea_relay" else "direct",
            "relay_configured": relay_configured,
            "relay_secure": relay_secure,
            "updated_at": row["updated_at"] if row else None,
        })
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    mode = str(payload.get("mode") or "")
    if mode not in {"direct", "korea_relay"}:
        return jsonify({"status": "error", "message": "지원하지 않는 AI API 연결 방식입니다."}), 400
    if mode == "korea_relay" and not relay_configured:
        return jsonify({"status": "error", "message": "한국 서버 프록시 URL·인증키 설정을 확인해 주세요. HTTP는 임시 허용 설정 없이는 사용할 수 없습니다."}), 409
    now = _iso_utc()
    with _db() as connection:
        before = connection.execute(
            "SELECT setting_value FROM service_settings WHERE setting_key='ai_route'"
        ).fetchone()
        connection.execute(
            """INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
               VALUES('ai_route',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
               setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by""",
            (mode, now, admin["id"]),
        )
        connection.execute(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'ai.routing.update',?,?,?)",
            (str(uuid.uuid4()), admin["id"], before["setting_value"] if before else "direct", mode, now),
        )
    return jsonify({"status": "success", "message": "AI API 연결 방식을 저장했습니다.", "mode": mode, "relay_configured": relay_configured, "relay_secure": relay_secure, "updated_at": now})


@admin_blueprint.route("/news-search", methods=["GET", "PATCH"])
def admin_news_search():
    admin = _admin_user()
    if not admin:
        return _admin_error()
    valid_modes = {"naver_only", "google_only", "naver_then_google", "google_then_naver"}
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='news_search_mode'"
            ).fetchone()
        mode = row["setting_value"] if row and row["setting_value"] in valid_modes else "google_then_naver"
        return jsonify({"status": "success", "mode": mode, "updated_at": row["updated_at"] if row else None})
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    mode = str(payload.get("mode") or "")
    if mode not in valid_modes:
        return jsonify({"status": "error", "message": "지원하지 않는 뉴스 검색 방식입니다."}), 400
    now = _iso_utc()
    with _db() as connection:
        before = connection.execute(
            "SELECT setting_value FROM service_settings WHERE setting_key='news_search_mode'"
        ).fetchone()
        connection.execute(
            """INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
               VALUES('news_search_mode',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
               setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by""",
            (mode, now, admin["id"]),
        )
        connection.execute(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'news.search.update',?,?,?)",
            (str(uuid.uuid4()), admin["id"], before["setting_value"] if before else "google_then_naver", mode, now),
        )
    return jsonify({"status": "success", "message": "뉴스 검색 방식을 저장했습니다.", "mode": mode, "updated_at": now})


@admin_blueprint.route("/ai-models", methods=["GET", "PATCH"])
def admin_ai_models():
    admin = _admin_user()
    if not admin:
        return _admin_error()
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='ai_model_catalog'"
            ).fetchone()
        return jsonify({
            "status": "success",
            "models": normalize_ai_model_catalog(row["setting_value"] if row else None, True),
            "updated_at": row["updated_at"] if row else None,
        })
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    models = normalize_ai_model_catalog(payload.get("models"), True)
    if not any(item["enabled"] for item in models):
        return jsonify({"status": "error", "message": "최소 한 개 이상의 AI 모델을 공개해야 합니다."}), 400
    serialized = json.dumps([
        {"value": item["value"], "enabled": item["enabled"], "badge": item["badge"]}
        for item in models
    ], ensure_ascii=False, separators=(",", ":"))
    now = _iso_utc()
    with _db() as connection:
        before = connection.execute(
            "SELECT setting_value FROM service_settings WHERE setting_key='ai_model_catalog'"
        ).fetchone()
        connection.execute(
            """INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
               VALUES('ai_model_catalog',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
               setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by""",
            (serialized, now, admin["id"]),
        )
        connection.execute(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'ai.models.update',?,?,?)",
            (str(uuid.uuid4()), admin["id"], before["setting_value"] if before else "", serialized, now),
        )
    return jsonify({"status": "success", "message": "AI 모델 노출 설정을 저장했습니다.", "models": models, "updated_at": now})


@admin_blueprint.get("/users")
def admin_users():
    if not _admin_user():
        return _admin_error()
    query = str(request.args.get("q") or "").strip()[:100]
    try:
        limit = min(100, max(1, int(request.args.get("limit", 50))))
        offset = max(0, int(request.args.get("offset", 0)))
    except ValueError:
        return jsonify({"status": "error", "message": "조회 범위가 올바르지 않습니다."}), 400
    where = "WHERE lower(u.email) LIKE ? OR lower(u.nickname) LIKE ?" if query else ""
    params = (f"%{query.lower()}%", f"%{query.lower()}%") if query else ()
    with _db() as connection:
        total = connection.execute(f"SELECT COUNT(*) AS count FROM users u {where}", params).fetchone()["count"]
        rows = connection.execute(
            f"""SELECT u.id, u.email, u.nickname, u.role, u.status, u.created_at, u.last_login_at,
                       COALESCE(c.balance, 0) AS credit_balance
                FROM users u LEFT JOIN user_writing_credits c ON c.user_id = u.id
                {where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?""",
            (*params, limit, offset),
        ).fetchall()
        summary = connection.execute(
            """SELECT COUNT(*) AS total,
                      SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins,
                      SUM(CASE WHEN status!='active' THEN 1 ELSE 0 END) AS inactive
               FROM users"""
        ).fetchone()
    return jsonify({"status": "success", "users": [dict(row) for row in rows], "total": total, "summary": dict(summary)})


@admin_blueprint.get("/summary")
def admin_summary():
    if not _admin_user():
        return _admin_error()
    with _db() as connection:
        summary = connection.execute(
            """SELECT COUNT(*) AS total,
                      SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins,
                      SUM(CASE WHEN status!='active' THEN 1 ELSE 0 END) AS inactive
               FROM users"""
        ).fetchone()
    return jsonify({"status": "success", "summary": dict(summary)})


@admin_blueprint.get("/users/<user_id>/detail")
def admin_user_detail(user_id):
    if not _admin_user():
        return _admin_error()
    now = _iso_utc()
    month_start = now[:7] + '-01T00:00:00+00:00'
    with _db() as connection:
        user = connection.execute(
            """SELECT id, email, nickname, role, status, email_verified_at,
                      created_at, updated_at, last_login_at
               FROM users WHERE id=?""",
            (user_id,),
        ).fetchone()
        if not user:
            return jsonify({"status": "error", "message": "회원을 찾을 수 없습니다."}), 404
        credit = connection.execute(
            "SELECT balance, earned_total, used_total, updated_at FROM user_writing_credits WHERE user_id=?",
            (user_id,),
        ).fetchone()
        activity = connection.execute(
            """SELECT
                 (SELECT COUNT(*) FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?) AS active_sessions,
                 (SELECT COUNT(*) FROM user_drafts WHERE user_id=?) AS draft_count,
                 (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=?) AS writing_jobs,
                 (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND status='completed') AS completed_jobs,
                 (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND status='failed') AS failed_jobs,
                 (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND created_at>=?) AS current_month_jobs,
                 (SELECT COALESCE(SUM(usage_units),0) FROM ai_writing_usage_logs WHERE user_id=?) AS usage_units,
                 (SELECT COALESCE(SUM(usage_units),0) FROM ai_writing_usage_logs WHERE user_id=? AND created_at>=?) AS current_month_units,
                 (SELECT COUNT(*) FROM referral_claims WHERE referred_user_id=? OR referrer_user_id=?) AS referral_count""",
            (user_id, now, user_id, user_id, user_id, user_id, user_id, month_start, user_id, user_id, month_start, user_id, user_id),
        ).fetchone()
        recent_jobs = connection.execute(
            "SELECT id, operation, writing_mode, model, status, execution_type, source_kind, input_chars, output_chars, duration_ms, usage_units, credit_charged, credit_refunded, error_code, created_at, completed_at FROM ai_writing_usage_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
        audit_logs = connection.execute(
            """SELECT l.action, l.before_value, l.after_value, l.reason, l.created_at,
                      COALESCE(a.nickname, a.email, '관리자') AS admin_name
               FROM admin_audit_logs l LEFT JOIN users a ON a.id=l.admin_user_id
               WHERE l.target_user_id=? ORDER BY l.created_at DESC LIMIT 20""",
            (user_id,),
        ).fetchall()
    return jsonify({
        "status": "success",
        "user": dict(user),
        "credits": dict(credit) if credit else {"balance": 0, "earned_total": 0, "used_total": 0, "updated_at": None},
        "activity": dict(activity),
        "recent_jobs": [dict(row) for row in recent_jobs],
        "audit_logs": [dict(row) for row in audit_logs],
    })

@admin_blueprint.patch("/users/<user_id>")
def admin_update_user(user_id):
    admin = _admin_user()
    if not admin:
        return _admin_error()
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    role = str(payload.get("role") or "")
    status = str(payload.get("status") or "")
    if role not in {"member", "premium", "operator", "admin"} or status not in {"active", "suspended"}:
        return jsonify({"status": "error", "message": "지원하지 않는 역할 또는 상태입니다."}), 400
    if user_id == admin["id"] and (role != "admin" or status != "active"):
        return jsonify({"status": "error", "message": "현재 로그인한 관리자 자신의 권한은 해제할 수 없습니다."}), 409
    now = _iso_utc()
    with _db() as connection:
        before = connection.execute("SELECT role, status FROM users WHERE id = ?", (user_id,)).fetchone()
        if not before:
            return jsonify({"status": "error", "message": "회원을 찾을 수 없습니다."}), 404
        connection.execute("UPDATE users SET role=?, status=?, updated_at=? WHERE id=?", (role, status, now, user_id))
        connection.execute(
            "INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, before_value, after_value, created_at) VALUES (?, ?, 'user.update', ?, ?, ?, ?)",
            (str(uuid.uuid4()), admin["id"], user_id, f"{before['role']}|{before['status']}", f"{role}|{status}", now),
        )
        if status != "active":
            connection.execute("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (now, user_id))
    return jsonify({"status": "success", "message": "회원 권한을 저장했습니다."})


@admin_blueprint.route("/users/<user_id>/credits", methods=["POST", "PATCH"])
def admin_grant_credits(user_id):
    admin = _admin_user()
    if not admin:
        return _admin_error()
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    now = _iso_utc()
    with _db() as connection:
        if not connection.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            return jsonify({"status": "error", "message": "회원을 찾을 수 없습니다."}), 404
        before_row = connection.execute(
            "SELECT balance, earned_total, used_total FROM user_writing_credits WHERE user_id=?", (user_id,)
        ).fetchone()
        before_balance = int(before_row["balance"]) if before_row else 0
        if request.method == "PATCH":
            try:
                balance = int(payload.get("balance"))
            except (TypeError, ValueError):
                balance = -1
            if not 0 <= balance <= 1000000:
                return jsonify({"status": "error", "message": "글쓰기 가능 건수는 0~1,000,000건으로 설정해 주세요."}), 400
            increase = max(0, balance - before_balance)
            connection.execute(
                """INSERT INTO user_writing_credits (user_id, balance, earned_total, used_total, updated_at)
                   VALUES (?, ?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET
                   balance=excluded.balance, earned_total=earned_total+?, updated_at=excluded.updated_at""",
                (user_id, balance, balance, now, increase),
            )
            connection.execute(
                """INSERT INTO admin_audit_logs
                   (id, admin_user_id, action, target_user_id, before_value, after_value, reason, created_at)
                   VALUES (?, ?, 'credits.set', ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), admin["id"], user_id, str(before_balance), str(balance),
                 str(payload.get("reason") or "관리자 페이지 잔여 건수 설정")[:200], now),
            )
            return jsonify({"status": "success", "message": f"글쓰기 가능 건수를 {balance:,}건으로 저장했습니다.", "balance": balance})
        try:
            amount = int(payload.get("amount", 0))
        except (TypeError, ValueError):
            amount = 0
        if not 1 <= amount <= 1000:
            return jsonify({"status": "error", "message": "쿠폰은 1~1,000건까지 지급할 수 있습니다."}), 400
        connection.execute(
            """INSERT INTO user_writing_credits (user_id, balance, earned_total, used_total, updated_at)
               VALUES (?, ?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET
               balance=balance+excluded.balance, earned_total=earned_total+excluded.earned_total,
               updated_at=excluded.updated_at""", (user_id, amount, amount, now),
        )
        connection.execute(
            "INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, after_value, reason, created_at) VALUES (?, ?, 'credits.grant', ?, ?, ?, ?)",
            (str(uuid.uuid4()), admin["id"], user_id, str(amount), str(payload.get("reason") or "관리자 지급")[:200], now),
        )
        balance = connection.execute("SELECT balance FROM user_writing_credits WHERE user_id=?", (user_id,)).fetchone()["balance"]
    return jsonify({"status": "success", "message": f"쿠폰 {amount}건을 지급했습니다.", "balance": balance})

@admin_blueprint.route("/permissions", methods=["GET", "PATCH"])
def admin_permissions():
    admin = _admin_user()
    if not admin:
        return _admin_error()
    if request.method == "GET":
        with _db() as connection:
            rows = connection.execute(
                "SELECT role, feature_key, enabled, updated_at FROM role_feature_permissions ORDER BY role, feature_key"
            ).fetchall()
        matrix = {}
        for row in rows:
            matrix.setdefault(row["role"], {})[row["feature_key"]] = bool(row["enabled"])
        return jsonify({"status": "success", "permissions": matrix})
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    role = str(payload.get("role") or "")
    permissions = payload.get("permissions") or {}
    valid_roles = {"member", "premium", "operator", "admin"}
    valid_features = {"dashboard.extended", "studio.access", "ai.write", "ai.personalize", "billing.access", "admin.members", "admin.permissions"}
    if role not in valid_roles or not isinstance(permissions, dict) or not set(permissions).issubset(valid_features):
        return jsonify({"status": "error", "message": "지원하지 않는 역할 또는 기능 권한입니다."}), 400
    if role == "admin":
        permissions = {feature_key: True for feature_key in valid_features}
    if role != "admin":
        permissions["admin.permissions"] = False
    now = _iso_utc()
    with _db() as connection:
        for feature_key, enabled in permissions.items():
            connection.execute(
                """INSERT INTO role_feature_permissions(role, feature_key, enabled, updated_at, updated_by)
                   VALUES(?,?,?,?,?) ON CONFLICT(role, feature_key) DO UPDATE SET
                   enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by""",
                (role, feature_key, 1 if enabled else 0, now, admin["id"]),
            )
        connection.execute(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,after_value,created_at) VALUES(?,?,'permissions.update',?,?)",
            (str(uuid.uuid4()), admin["id"], f"{role}:{json.dumps(permissions, ensure_ascii=False, sort_keys=True)}", now),
        )
    return jsonify({"status": "success", "message": "기능별 권한을 저장했습니다.", "role": role, "permissions": permissions})


@auth_blueprint.post("/request-otp")
def request_otp():
    payload = request.get_json(silent=True) or {}
    try:
        email = _normalize_email(payload.get("email"))
        nickname = _normalize_nickname(payload.get("nickname"))
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400

    now = _utc_now()
    now_iso = _iso_utc(now)
    with _db() as connection:
        latest = connection.execute(
            "SELECT created_at FROM otp_challenges WHERE email = ? ORDER BY created_at DESC LIMIT 1",
            (email,),
        ).fetchone()
        if latest:
            created_at = datetime.fromisoformat(latest["created_at"])
            retry_after = OTP_RESEND_SECONDS - int((now - created_at).total_seconds())
            if retry_after > 0:
                return jsonify({
                    "status": "rate_limited",
                    "message": f"{retry_after}초 후 인증번호를 다시 요청해 주세요.",
                    "retry_after": retry_after,
                }), 429

        otp = f"{secrets.randbelow(1_000_000):06d}"
        challenge_id = str(uuid.uuid4())
        connection.execute(
            """
            INSERT INTO otp_challenges
                (id, email, nickname, otp_hash, expires_at, attempts, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (
                challenge_id,
                email,
                nickname,
                _auth_hash("otp", challenge_id, email, otp),
                _iso_utc(now + timedelta(seconds=OTP_TTL_SECONDS)),
                now_iso,
            ),
        )

    try:
        delivery = _send_otp_email(email, otp)
    except Exception as error:
        with _db() as connection:
            connection.execute("DELETE FROM otp_challenges WHERE id = ?", (challenge_id,))
        return jsonify({"status": "error", "message": f"인증 메일 발송에 실패했습니다: {error}"}), 502

    message = "입력한 이메일로 6자리 인증번호를 보냈습니다."
    response_payload = {
        "status": "success",
        "message": message,
        "challenge_id": challenge_id,
        "expires_in": OTP_TTL_SECONDS,
        "delivery": delivery,
    }
    if delivery == "console":
        response_payload["message"] = f"로컬 개발 인증번호는 {otp}입니다."
        response_payload["development_otp"] = otp
    return jsonify(response_payload)


@auth_blueprint.post("/verify-otp")
def verify_otp():
    payload = request.get_json(silent=True) or {}
    challenge_id = str(payload.get("challenge_id") or "").strip()
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))
    if not challenge_id or len(otp) != 6:
        return jsonify({"status": "error", "message": "6자리 인증번호를 입력해 주세요."}), 400

    now = _utc_now()
    now_iso = _iso_utc(now)
    with _db() as connection:
        challenge = connection.execute(
            "SELECT * FROM otp_challenges WHERE id = ?",
            (challenge_id,),
        ).fetchone()
        if not challenge or challenge["consumed_at"]:
            return jsonify({"status": "error", "message": "유효하지 않거나 이미 사용한 인증 요청입니다."}), 400
        if challenge["expires_at"] <= now_iso:
            return jsonify({"status": "expired", "message": "인증번호가 만료되었습니다. 다시 요청해 주세요."}), 410
        if challenge["attempts"] >= OTP_MAX_ATTEMPTS:
            return jsonify({"status": "locked", "message": "입력 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요."}), 429

        expected = challenge["otp_hash"]
        actual = _auth_hash("otp", challenge_id, challenge["email"], otp)
        if not hmac.compare_digest(actual, expected):
            connection.execute(
                "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?",
                (challenge_id,),
            )
            return jsonify({"status": "error", "message": "인증번호가 올바르지 않습니다."}), 401

        user = connection.execute("SELECT * FROM users WHERE email = ?", (challenge["email"],)).fetchone()
        if user:
            connection.execute(
                """
                UPDATE users SET nickname = ?, email_verified_at = ?, updated_at = ?, last_login_at = ?
                WHERE id = ?
                """,
                (challenge["nickname"], now_iso, now_iso, now_iso, user["id"]),
            )
            user_id = user["id"]
        else:
            user_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO users
                    (id, email, nickname, role, status, email_verified_at, created_at, updated_at, last_login_at)
                VALUES (?, ?, ?, 'member', 'active', ?, ?, ?, ?)
                """,
                (user_id, challenge["email"], challenge["nickname"], now_iso, now_iso, now_iso, now_iso),
            )

        connection.execute(
            "UPDATE otp_challenges SET consumed_at = ? WHERE id = ?",
            (now_iso, challenge_id),
        )
        session_token = secrets.token_urlsafe(32)
        connection.execute(
            """
            INSERT INTO auth_sessions
                (id, user_id, token_hash, expires_at, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                user_id,
                _auth_hash("session", session_token),
                _iso_utc(now + timedelta(days=AUTH_SESSION_DAYS)),
                now_iso,
                now_iso,
            ),
        )
        user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    response = make_response(jsonify({
        "status": "success",
        "message": "로그인되었습니다.",
        "user": _serialize_user(user),
    }))
    response.set_cookie(
        AUTH_COOKIE_NAME,
        session_token,
        max_age=AUTH_SESSION_DAYS * 86400,
        httponly=True,
        secure=request.is_secure,
        samesite="Lax",
        path="/",
    )
    return response


@auth_blueprint.get("/session")
def session_status():
    user = _current_session()
    if not user:
        return jsonify({"status": "anonymous", "authenticated": False})
    return jsonify({"status": "success", "authenticated": True, "user": _serialize_user(user), "permissions": _permissions_for_role(user["role"])})


@auth_blueprint.route("/preferences/ai-instruction-sections", methods=["GET", "PUT"])
def personal_ai_instruction_sections():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if not _has_feature(user, "ai.personalize"):
        return jsonify({"status": "error", "message": "현재 회원 등급에는 AI 개인화 권한이 없습니다."}), 403
    if request.method == "GET":
        return jsonify({"status": "success", "sections": get_user_ai_instruction_sections(user)})
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    raw_sections = payload.get("sections")
    if not isinstance(raw_sections, dict) or set(raw_sections) != set(DEFAULT_AI_INSTRUCTION_SECTIONS):
        return jsonify({"status": "error", "message": "지원하지 않는 AI 지침 구성입니다."}), 400
    sections = _normalize_ai_instruction_sections(raw_sections)
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ai_instruction_sections
               (user_id, absolute, selected, persona, conflict, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET absolute=excluded.absolute,
               selected=excluded.selected, persona=excluded.persona,
               conflict=excluded.conflict, updated_at=excluded.updated_at""",
            (user["id"], int(sections["absolute"]), int(sections["selected"]),
             int(sections["persona"]), int(sections["conflict"]), updated_at),
        )
    return jsonify({
        "status": "success",
        "message": "개인 AI 전달 구성을 저장했습니다.",
        "sections": sections,
        "updated_at": updated_at,
    })


@auth_blueprint.route("/preferences/ai-persona", methods=["GET", "PUT"])
def ai_persona_preferences():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if not _has_feature(user, "ai.personalize"):
        return jsonify({"status": "error", "message": "현재 회원 등급에는 AI 개인화 권한이 없습니다."}), 403

    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT category_group, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at "
                "FROM user_ai_preferences WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        return jsonify({"status": "success", "preference": dict(row) if row else None})

    payload = request.get_json(silent=True) or {}
    category_group = re.sub(r"\s+", " ", str(payload.get("category_group") or "").strip())[:40]
    category = re.sub(r"\s+", " ", str(payload.get("category") or "").strip())[:30]
    persona = re.sub(r"\s+", " ", str(payload.get("persona") or "").strip())[:50]
    tone_level = str(payload.get("tone_level") or "balanced").strip()
    detail_level = str(payload.get("detail_level") or "normal").strip()
    custom_instruction = str(payload.get("custom_instruction") or "").strip()
    enabled = 1 if payload.get("enabled", True) is not False else 0
    if not category_group or not persona or (category_group != "주제 선택 안 함" and not category):
        return jsonify({"status": "error", "message": "작성 카테고리와 페르소나를 선택해 주세요."}), 400
    if tone_level not in {"calm", "balanced", "lively"} or detail_level not in {"concise", "normal", "detailed"}:
        return jsonify({"status": "error", "message": "지원하지 않는 개인화 설정입니다."}), 400
    if len(custom_instruction) > 2000:
        return jsonify({"status": "error", "message": "개인 지침은 2,000자 이내로 입력해 주세요."}), 400
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ai_preferences
               (user_id, category_group, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET category_group=excluded.category_group,
               category=excluded.category, persona=excluded.persona,
               tone_level=excluded.tone_level, detail_level=excluded.detail_level,
               custom_instruction=excluded.custom_instruction, enabled=excluded.enabled,
               updated_at=excluded.updated_at""",
            (user["id"], category_group, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at),
        )
    return jsonify({"status": "success", "message": "AI 페르소나·톤앤매너 설정을 저장했습니다.", "updated_at": updated_at})


@auth_blueprint.route("/preferences/integrations", methods=["GET", "PUT"])
def integration_preferences():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if user["role"] != "admin":
        return jsonify({"status": "error", "message": "관리자 권한이 필요합니다."}), 403
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT naver_blog_open_enabled, updated_at FROM user_integration_preferences WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        return jsonify({
            "status": "success",
            "eligible": True,
            "preference": {
                "naver_blog_open_enabled": bool(row["naver_blog_open_enabled"]) if row else True,
                "updated_at": row["updated_at"] if row else None,
            },
        })
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    enabled = bool(payload.get("naver_blog_open_enabled", True))
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_integration_preferences (user_id, naver_blog_open_enabled, updated_at)
               VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
               naver_blog_open_enabled=excluded.naver_blog_open_enabled, updated_at=excluded.updated_at""",
            (user["id"], 1 if enabled else 0, updated_at),
        )
    return jsonify({
        "status": "success",
        "message": "네이버 글쓰기 열기 설정을 저장했습니다.",
        "eligible": True,
        "preference": {"naver_blog_open_enabled": enabled, "updated_at": updated_at},
    })


@auth_blueprint.route("/preferences/system-instruction", methods=["GET", "PUT"])
def personal_system_instruction():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if not _has_feature(user, "ai.personalize"):
        return jsonify({"status": "error", "message": "현재 회원 등급에는 AI 개인화 권한이 없습니다."}), 403
    instruction_type = str(request.args.get("type") or "keyword").strip()
    if instruction_type not in {"keyword", "story"}:
        return jsonify({"status": "error", "message": "지원하지 않는 지침 유형입니다."}), 400
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT instruction, updated_at FROM user_ai_instructions WHERE user_id = ? AND instruction_type = ?",
                (user["id"], instruction_type),
            ).fetchone()
        return jsonify({"status": "success", "instruction": row["instruction"] if row else "", "updated_at": row["updated_at"] if row else None})
    payload = request.get_json(silent=True) or {}
    instruction = str(payload.get("instruction") or "").strip()
    if not instruction:
        with _db() as connection:
            connection.execute(
                "DELETE FROM user_ai_instructions WHERE user_id = ? AND instruction_type = ?",
                (user["id"], instruction_type),
            )
        return jsonify({
            "status": "success",
            "message": "개인 시스템 지침을 삭제했습니다.",
            "instruction": "",
            "updated_at": None,
            "length": 0,
            "deleted": True,
        })
    if len(instruction) < 20:
        return jsonify({"status": "error", "message": "개인 시스템 지침을 20자 이상 입력해 주세요."}), 400
    if len(instruction) > 20_000:
        return jsonify({"status": "error", "message": "개인 시스템 지침은 20,000자를 초과할 수 없습니다."}), 400
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ai_instructions (user_id, instruction_type, instruction, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(user_id, instruction_type) DO UPDATE SET
               instruction=excluded.instruction, updated_at=excluded.updated_at""",
            (user["id"], instruction_type, instruction, updated_at),
        )
    return jsonify({"status": "success", "message": "개인 시스템 지침을 저장했습니다.", "instruction": instruction, "updated_at": updated_at, "length": len(instruction)})



@auth_blueprint.route("/preferences/ui", methods=["GET", "PUT"])
def ui_preferences():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if request.method == "GET":
        with _db() as connection:
            row = connection.execute(
                "SELECT font_family, font_scale, font_weight, theme_mode, updated_at FROM user_ui_preferences WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        return jsonify({"status": "success", "preference": dict(row) if row else None})
    payload = request.get_json(silent=True) or {}
    font_family = str(payload.get("font_family") or "paperlogy")
    font_scale = str(payload.get("font_scale") or "normal")
    font_weight = str(payload.get("font_weight") or "400")
    theme_mode = str(payload.get("theme_mode") or "system")
    if font_family not in {"paperlogy", "pretendard", "suit", "noto", "system", "serif"} or font_scale not in {"compact", "normal", "large"} or font_weight not in {"300", "400", "500"} or theme_mode not in {"system", "light", "dark"}:
        return jsonify({"status": "error", "message": "지원하지 않는 화면 글꼴 설정입니다."}), 400
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ui_preferences (user_id, font_family, font_scale, font_weight, theme_mode, updated_at)
               VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
               font_family=excluded.font_family, font_scale=excluded.font_scale,
               font_weight=excluded.font_weight, theme_mode=excluded.theme_mode, updated_at=excluded.updated_at""",
            (user["id"], font_family, font_scale, font_weight, theme_mode, updated_at),
        )
    return jsonify({"status": "success", "message": "화면 테마와 글꼴 설정을 저장했습니다.", "updated_at": updated_at})


def _serialize_draft(row, include_body=False):
    draft = {
        "id": row["id"], "title": row["title"], "category": row["category"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "status": "saved",
    }
    if "body_length" in row.keys():
        draft["body_length"] = int(row["body_length"] or 0)
    if include_body:
        draft["body_markdown"] = row["body_markdown"]
        try:
            draft["tags"] = json.loads(row["tags_json"] or "[]")
        except (TypeError, json.JSONDecodeError):
            draft["tags"] = []
        try:
            draft["source_urls"] = json.loads(row["source_urls_json"] or "[]")
        except (TypeError, json.JSONDecodeError):
            draft["source_urls"] = []
    return draft


@auth_blueprint.route("/drafts", methods=["GET", "POST"])
def account_drafts():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if not _has_feature(user, "ai.write"):
        return jsonify({"status": "error", "message": "현재 회원 등급에는 원고 저장 권한이 없습니다."}), 403

    limit = 5
    if request.method == "GET":
        with _db() as connection:
            rows = connection.execute(
                "SELECT id, title, category, created_at, updated_at, length(body_markdown) AS body_length "
                "FROM user_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
                (user["id"], limit),
            ).fetchall()
            count = connection.execute("SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?", (user["id"],)).fetchone()["count"]
        return jsonify({"status": "success", "drafts": [_serialize_draft(row) for row in rows], "count": count, "limit": limit})

    payload = request.get_json(silent=True) or {}
    title = re.sub(r"\s+", " ", str(payload.get("title") or "").strip())[:300]
    body = str(payload.get("body_markdown") or "").strip()
    category = re.sub(r"\s+", " ", str(payload.get("category") or "").strip())[:100]
    tags = [str(value).strip()[:100] for value in (payload.get("tags") or []) if str(value).strip()][:30]
    source_urls = [str(value).strip()[:2000] for value in (payload.get("source_urls") or []) if str(value).strip()][:30]
    if not title or len(body) < 30:
        return jsonify({"status": "error", "message": "제목과 30자 이상의 본문이 필요합니다."}), 400
    now = _iso_utc()
    with _db() as connection:
        existing = connection.execute(
            "SELECT id, created_at FROM user_drafts WHERE user_id = ? AND title = ? ORDER BY updated_at DESC LIMIT 1",
            (user["id"], title),
        ).fetchone()
        if existing:
            draft_id, created_at, updated_existing = existing["id"], existing["created_at"], True
        else:
            count = connection.execute("SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?", (user["id"],)).fetchone()["count"]
            if count >= limit and not payload.get("replace_oldest"):
                oldest = connection.execute(
                    "SELECT title FROM user_drafts WHERE user_id = ? ORDER BY updated_at ASC LIMIT 1", (user["id"],),
                ).fetchone()
                return jsonify({"status": "error", "code": "DRAFT_LIMIT_REACHED", "message": "내 원고함이 가득 찼습니다.", "count": count, "limit": limit, "replace_count": 1, "oldest_titles": [oldest["title"]] if oldest else []}), 409
            if count >= limit:
                connection.execute(
                    "DELETE FROM user_drafts WHERE id = (SELECT id FROM user_drafts WHERE user_id = ? ORDER BY updated_at ASC LIMIT 1) AND user_id = ?",
                    (user["id"], user["id"]),
                )
            draft_id, created_at, updated_existing = str(uuid.uuid4()), now, False
        connection.execute(
            """INSERT INTO user_drafts (id, user_id, title, body_markdown, tags_json, category, source_urls_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET title=excluded.title, body_markdown=excluded.body_markdown,
               tags_json=excluded.tags_json, category=excluded.category, source_urls_json=excluded.source_urls_json,
               updated_at=excluded.updated_at""",
            (draft_id, user["id"], title, body, json.dumps(tags, ensure_ascii=False), category,
             json.dumps(source_urls, ensure_ascii=False), created_at, now),
        )
        count = connection.execute("SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?", (user["id"],)).fetchone()["count"]
    return jsonify({"status": "success", "message": "원고를 계정 DB에 저장했습니다.", "draft": {"id": draft_id, "title": title}, "updated_existing": updated_existing, "count": count, "limit": limit})


@auth_blueprint.route("/drafts/<draft_id>", methods=["GET", "DELETE"])
def account_draft_detail(draft_id):
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    if not _has_feature(user, "ai.write"):
        return jsonify({"status": "error", "message": "현재 회원 등급에는 원고 저장 권한이 없습니다."}), 403
    with _db() as connection:
        row = connection.execute(
            "SELECT * FROM user_drafts WHERE id = ? AND user_id = ?", (draft_id, user["id"]),
        ).fetchone()
        if not row:
            return jsonify({"status": "error", "message": "원고를 찾을 수 없습니다."}), 404
        if request.method == "GET":
            return jsonify({"status": "success", "draft": _serialize_draft(row, include_body=True)})
        connection.execute("DELETE FROM user_drafts WHERE id = ? AND user_id = ?", (draft_id, user["id"]))
        count = connection.execute("SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?", (user["id"],)).fetchone()["count"]
    return jsonify({"status": "success", "message": "원고를 삭제했습니다.", "count": count, "limit": 5})


@auth_blueprint.get("/referrals/status")
def referral_status():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    with _db() as connection:
        credit = connection.execute(
            "SELECT balance, earned_total, used_total FROM user_writing_credits WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
        claim = connection.execute(
            "SELECT reward_count, created_at FROM referral_claims WHERE referred_user_id = ?",
            (user["id"],),
        ).fetchone()
    unlimited = user["role"] in {"premium", "operator", "admin"}
    return jsonify({
        "status": "success",
        "balance": None if unlimited else (int(credit["balance"]) if credit else 0),
        "earned_total": int(credit["earned_total"]) if credit else 0,
        "used_total": int(credit["used_total"]) if credit else 0,
        "unlimited": unlimited,
        "display_limit": 10,
        "claimed": bool(claim),
        "reward_count": int(claim["reward_count"]) if claim else 10,
        "claimed_at": claim["created_at"] if claim else None,
    })


@auth_blueprint.post("/referrals/claim")
def claim_referral():
    user = _current_session()
    if not user:
        return jsonify({"status": "error", "message": "로그인이 필요합니다."}), 401
    payload = request.get_json(silent=True) or {}
    try:
        referrer_email = _normalize_email(payload.get("referrer_email"))
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 400
    if referrer_email == str(user["email"]).lower():
        return jsonify({"status": "error", "message": "본인 이메일은 추천인으로 등록할 수 없습니다."}), 400
    now = _iso_utc()
    with _db() as connection:
        existing = connection.execute(
            "SELECT 1 FROM referral_claims WHERE referred_user_id = ?", (user["id"],),
        ).fetchone()
        if existing:
            return jsonify({"status": "error", "message": "추천인 쿠폰은 계정당 한 번만 발급됩니다."}), 409
        referrer = connection.execute(
            "SELECT id FROM users WHERE email = ? AND status = 'active' AND email_verified_at IS NOT NULL",
            (referrer_email,),
        ).fetchone()
        if not referrer:
            return jsonify({"status": "error", "message": "가입과 이메일 인증을 완료한 친구를 찾을 수 없습니다."}), 404
        connection.execute(
            "INSERT INTO referral_claims (id, referred_user_id, referrer_user_id, reward_count, created_at) VALUES (?, ?, ?, 10, ?)",
            (str(uuid.uuid4()), user["id"], referrer["id"], now),
        )
        connection.execute(
            """INSERT INTO user_writing_credits (user_id, balance, earned_total, used_total, updated_at)
               VALUES (?, 10, 10, 0, ?)
               ON CONFLICT(user_id) DO UPDATE SET balance=balance+10,
               earned_total=earned_total+10, updated_at=excluded.updated_at""",
            (user["id"], now),
        )
        credit = connection.execute(
            "SELECT balance FROM user_writing_credits WHERE user_id = ?", (user["id"],),
        ).fetchone()
    return jsonify({
        "status": "success", "message": "무료 AI 글쓰기 쿠폰 10건을 발급했습니다.",
        "reward_count": 10, "balance": int(credit["balance"]), "claimed": True,
    })


@auth_blueprint.post("/logout")
def logout():
    token = request.cookies.get(AUTH_COOKIE_NAME, "")
    if token:
        with _db() as connection:
            connection.execute(
                "UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                (_iso_utc(), _auth_hash("session", token)),
            )
    response = make_response(jsonify({"status": "success", "message": "로그아웃되었습니다."}))
    response.delete_cookie(AUTH_COOKIE_NAME, path="/", samesite="Lax")
    return response


def init_member_auth(app):
    """Flask 앱에 인증 API를 등록하고 SQLite 스키마를 준비한다."""
    with _db():
        pass
    app.register_blueprint(auth_blueprint)
    app.register_blueprint(admin_blueprint)

