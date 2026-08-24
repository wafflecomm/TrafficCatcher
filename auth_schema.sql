-- Traffic Catcher 회원·이메일 OTP 인증 공통 스키마
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    email_verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    nickname TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_email_created
ON otp_challenges(email, created_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token
ON auth_sessions(token_hash);

CREATE TABLE IF NOT EXISTS user_ai_preferences (
    user_id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT '일상',
    persona TEXT NOT NULL DEFAULT '친근한 이웃 블로거',
    tone_level TEXT NOT NULL DEFAULT 'balanced',
    detail_level TEXT NOT NULL DEFAULT 'normal',
    custom_instruction TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_ai_instructions (
    user_id TEXT NOT NULL,
    instruction_type TEXT NOT NULL,
    instruction TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, instruction_type),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_ui_preferences (
    user_id TEXT PRIMARY KEY,
    font_family TEXT NOT NULL DEFAULT 'paperlogy',
    font_scale TEXT NOT NULL DEFAULT 'normal',
    font_weight TEXT NOT NULL DEFAULT '400',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
