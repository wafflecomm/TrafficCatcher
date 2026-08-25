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

auth_blueprint = Blueprint("member_auth", __name__, url_prefix="/api/auth")
admin_blueprint = Blueprint("member_admin", __name__, url_prefix="/api/admin")


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


def _admin_user():
    user = _current_session()
    return user if user and user["role"] == "admin" else None


def _same_origin():
    origin = request.headers.get("Origin")
    return not origin or origin.rstrip("/") == request.host_url.rstrip("/")


def _admin_error():
    return jsonify({"status": "error", "message": "관리자 권한이 필요합니다."}), 403


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


@admin_blueprint.post("/users/<user_id>/credits")
def admin_grant_credits(user_id):
    admin = _admin_user()
    if not admin:
        return _admin_error()
    if not _same_origin():
        return jsonify({"status": "error", "message": "허용되지 않은 요청 출처입니다."}), 403
    payload = request.get_json(silent=True) or {}
    try:
        amount = int(payload.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0
    if not 1 <= amount <= 1000:
        return jsonify({"status": "error", "message": "쿠폰은 1~1,000건까지 지급할 수 있습니다."}), 400
    now = _iso_utc()
    with _db() as connection:
        if not connection.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
            return jsonify({"status": "error", "message": "회원을 찾을 수 없습니다."}), 404
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
                "SELECT category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at "
                "FROM user_ai_preferences WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        return jsonify({"status": "success", "preference": dict(row) if row else None})

    payload = request.get_json(silent=True) or {}
    category = re.sub(r"\s+", " ", str(payload.get("category") or "").strip())[:30]
    persona = re.sub(r"\s+", " ", str(payload.get("persona") or "").strip())[:50]
    tone_level = str(payload.get("tone_level") or "balanced").strip()
    detail_level = str(payload.get("detail_level") or "normal").strip()
    custom_instruction = str(payload.get("custom_instruction") or "").strip()
    enabled = 1 if payload.get("enabled", True) is not False else 0
    if not category or not persona:
        return jsonify({"status": "error", "message": "카테고리와 페르소나를 선택해 주세요."}), 400
    if tone_level not in {"calm", "balanced", "lively"} or detail_level not in {"concise", "normal", "detailed"}:
        return jsonify({"status": "error", "message": "지원하지 않는 개인화 설정입니다."}), 400
    if len(custom_instruction) > 2000:
        return jsonify({"status": "error", "message": "개인 지침은 2,000자 이내로 입력해 주세요."}), 400
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ai_preferences
               (user_id, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET category=excluded.category, persona=excluded.persona,
               tone_level=excluded.tone_level, detail_level=excluded.detail_level,
               custom_instruction=excluded.custom_instruction, enabled=excluded.enabled,
               updated_at=excluded.updated_at""",
            (user["id"], category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at),
        )
    return jsonify({"status": "success", "message": "AI 페르소나·톤앤매너 설정을 저장했습니다.", "updated_at": updated_at})


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
                "SELECT font_family, font_scale, font_weight, updated_at FROM user_ui_preferences WHERE user_id = ?",
                (user["id"],),
            ).fetchone()
        return jsonify({"status": "success", "preference": dict(row) if row else None})
    payload = request.get_json(silent=True) or {}
    font_family = str(payload.get("font_family") or "paperlogy")
    font_scale = str(payload.get("font_scale") or "normal")
    font_weight = str(payload.get("font_weight") or "400")
    if font_family not in {"paperlogy", "pretendard", "suit", "noto", "system", "serif"} or font_scale not in {"compact", "normal", "large"} or font_weight not in {"300", "400", "500"}:
        return jsonify({"status": "error", "message": "지원하지 않는 화면 글꼴 설정입니다."}), 400
    updated_at = _iso_utc()
    with _db() as connection:
        connection.execute(
            """INSERT INTO user_ui_preferences (user_id, font_family, font_scale, font_weight, updated_at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
               font_family=excluded.font_family, font_scale=excluded.font_scale,
               font_weight=excluded.font_weight, updated_at=excluded.updated_at""",
            (user["id"], font_family, font_scale, font_weight, updated_at),
        )
    return jsonify({"status": "success", "message": "화면 글꼴 설정을 저장했습니다.", "updated_at": updated_at})


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
    return jsonify({
        "status": "success",
        "balance": int(credit["balance"]) if credit else 0,
        "earned_total": int(credit["earned_total"]) if credit else 0,
        "used_total": int(credit["used_total"]) if credit else 0,
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

