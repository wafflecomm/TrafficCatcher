"""Traffic Catcher 이메일 OTP 회원 인증(로컬 Flask + SQLite)."""

from __future__ import annotations

import hashlib
import hmac
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

auth_blueprint = Blueprint("member_auth", __name__, url_prefix="/api/auth")


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

    message = EmailMessage()
    message["Subject"] = "[Traffic Catcher] 로그인 인증번호"
    message["From"] = from_email
    message["To"] = email
    message.set_content(
        f"Traffic Catcher 인증번호는 {otp}입니다.\n\n"
        "인증번호는 5분 동안 유효하며 다른 사람에게 알려주지 마세요."
    )
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
    if delivery == "console":
        message = "로컬 개발 모드입니다. 서버 실행 창에 표시된 인증번호를 입력해 주세요."
    return jsonify({
        "status": "success",
        "message": message,
        "challenge_id": challenge_id,
        "expires_in": OTP_TTL_SECONDS,
        "delivery": delivery,
    })


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
    return jsonify({"status": "success", "authenticated": True, "user": _serialize_user(user)})


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

