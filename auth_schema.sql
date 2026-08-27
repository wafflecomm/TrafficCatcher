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
    category_group TEXT NOT NULL DEFAULT '생활·노하우·쇼핑',
    category TEXT NOT NULL DEFAULT '일상·생각',
    persona TEXT NOT NULL DEFAULT '친근한 이웃 블로거',
    tone_level TEXT NOT NULL DEFAULT 'balanced',
    detail_level TEXT NOT NULL DEFAULT 'normal',
    custom_instruction TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
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

CREATE TABLE IF NOT EXISTS user_ai_instruction_sections (
    user_id TEXT PRIMARY KEY,
    absolute INTEGER NOT NULL DEFAULT 1,
    selected INTEGER NOT NULL DEFAULT 1,
    persona INTEGER NOT NULL DEFAULT 1,
    conflict INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_integration_preferences (
    user_id TEXT PRIMARY KEY,
    naver_blog_open_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT '',
    source_urls_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_drafts_user_updated ON user_drafts(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_ui_preferences (
    user_id TEXT PRIMARY KEY,
    font_family TEXT NOT NULL DEFAULT 'paperlogy',
    font_scale TEXT NOT NULL DEFAULT 'normal',
    font_weight TEXT NOT NULL DEFAULT '400',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_writing_credits (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    earned_total INTEGER NOT NULL DEFAULT 0,
    used_total INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referral_claims (
    id TEXT PRIMARY KEY,
    referred_user_id TEXT NOT NULL UNIQUE,
    referrer_user_id TEXT NOT NULL,
    reward_count INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL,
    FOREIGN KEY (referred_user_id) REFERENCES users(id),
    FOREIGN KEY (referrer_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer
ON referral_claims(referrer_user_id);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    before_value TEXT NOT NULL DEFAULT '',
    after_value TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_user_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
ON admin_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS service_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS role_feature_permissions (
    role TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (role, feature_key)
);

INSERT OR IGNORE INTO role_feature_permissions(role, feature_key, enabled, updated_at) VALUES
('member','dashboard.extended',1,datetime('now')),('member','studio.access',1,datetime('now')),
('member','ai.write',1,datetime('now')),('member','ai.personalize',1,datetime('now')),
('member','billing.access',1,datetime('now')),('member','admin.members',0,datetime('now')),
('member','admin.permissions',0,datetime('now')),
('premium','dashboard.extended',1,datetime('now')),('premium','studio.access',1,datetime('now')),
('premium','ai.write',1,datetime('now')),('premium','ai.personalize',1,datetime('now')),
('premium','billing.access',1,datetime('now')),('premium','admin.members',0,datetime('now')),
('premium','admin.permissions',0,datetime('now')),
('operator','dashboard.extended',1,datetime('now')),('operator','studio.access',1,datetime('now')),
('operator','ai.write',1,datetime('now')),('operator','ai.personalize',1,datetime('now')),
('operator','billing.access',1,datetime('now')),('operator','admin.members',1,datetime('now')),
('operator','admin.permissions',0,datetime('now')),
('admin','dashboard.extended',1,datetime('now')),('admin','studio.access',1,datetime('now')),
('admin','ai.write',1,datetime('now')),('admin','ai.personalize',1,datetime('now')),
('admin','billing.access',1,datetime('now')),('admin','admin.members',1,datetime('now')),
('admin','admin.permissions',1,datetime('now'));

UPDATE role_feature_permissions SET enabled=1, updated_at=datetime('now') WHERE role='admin';
