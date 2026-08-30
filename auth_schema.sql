-- Traffic Catcher 회원·이메일 OTP 인증 공통 스키마
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    plan_code TEXT NOT NULL DEFAULT 'free',
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

CREATE TABLE IF NOT EXISTS user_ai_persona_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category_group TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    persona TEXT NOT NULL,
    tone_level TEXT NOT NULL DEFAULT 'balanced',
    detail_level TEXT NOT NULL DEFAULT 'normal',
    custom_instruction TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_ai_persona_profiles_user_updated
ON user_ai_persona_profiles(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_ai_persona_selections (
    user_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES user_ai_persona_profiles(id) ON DELETE CASCADE
);

-- 기존 단일 페르소나 설정은 이름 있는 기본 페르소나로 자동 이전합니다.
INSERT OR IGNORE INTO user_ai_persona_profiles
    (id,user_id,name,category_group,category,persona,tone_level,detail_level,custom_instruction,created_at,updated_at)
SELECT 'legacy-persona:' || user_id,user_id,'기본 페르소나',category_group,category,persona,
       tone_level,detail_level,custom_instruction,updated_at,updated_at
FROM user_ai_preferences
WHERE NOT EXISTS (
    SELECT 1 FROM user_ai_persona_profiles p
    WHERE p.user_id=user_ai_preferences.user_id
);

INSERT OR IGNORE INTO user_ai_persona_selections(user_id,profile_id,updated_at)
SELECT user_id,'legacy-persona:' || user_id,updated_at FROM user_ai_preferences
WHERE EXISTS (
    SELECT 1 FROM user_ai_persona_profiles p
    WHERE p.id='legacy-persona:' || user_ai_preferences.user_id
);

CREATE TABLE IF NOT EXISTS user_ai_instructions (
    user_id TEXT NOT NULL,
    instruction_type TEXT NOT NULL,
    instruction TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, instruction_type),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_ai_instruction_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword', 'story')),
    name TEXT NOT NULL,
    instruction TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, instruction_type, name)
);

CREATE INDEX IF NOT EXISTS idx_user_ai_instruction_profiles_user_type
ON user_ai_instruction_profiles(user_id, instruction_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_ai_instruction_selections (
    user_id TEXT NOT NULL,
    instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword', 'story')),
    profile_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, instruction_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES user_ai_instruction_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ai_instruction_usage (
    user_id TEXT NOT NULL,
    instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword', 'story')),
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, instruction_type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 기존 단일 지침은 이름 있는 기본 프리셋으로 자동 이전합니다.
INSERT OR IGNORE INTO user_ai_instruction_profiles
    (id, user_id, instruction_type, name, instruction, created_at, updated_at)
SELECT 'legacy:' || user_id || ':' || instruction_type,
       user_id,
       instruction_type,
       CASE instruction_type WHEN 'story' THEN '기본 메모·스토리 지침' ELSE '기본 키워드·뉴스 지침' END,
       instruction,
       updated_at,
       updated_at
FROM user_ai_instructions
WHERE length(trim(instruction)) > 0
  AND NOT EXISTS (
      SELECT 1 FROM user_ai_instruction_usage u
      WHERE u.user_id=user_ai_instructions.user_id
        AND u.instruction_type=user_ai_instructions.instruction_type
        AND u.enabled=0
  );

INSERT OR IGNORE INTO user_ai_instruction_selections
    (user_id, instruction_type, profile_id, updated_at)
SELECT user_id, instruction_type, 'legacy:' || user_id || ':' || instruction_type, updated_at
FROM user_ai_instructions
WHERE length(trim(instruction)) > 0
  AND NOT EXISTS (
      SELECT 1 FROM user_ai_instruction_usage u
      WHERE u.user_id=user_ai_instructions.user_id
        AND u.instruction_type=user_ai_instructions.instruction_type
        AND u.enabled=0
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
    theme_mode TEXT NOT NULL DEFAULT 'system',
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

CREATE TABLE IF NOT EXISTS ai_background_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    credit_reserved INTEGER NOT NULL DEFAULT 0,
    credit_refunded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_background_jobs_user_created
ON ai_background_jobs(user_id, created_at DESC);

-- 글 원문이나 완성 결과를 저장하지 않는 회원별 AI 사용량 기록
CREATE TABLE IF NOT EXISTS ai_writing_usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'article',
    writing_mode TEXT NOT NULL DEFAULT 'keyword',
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    execution_type TEXT NOT NULL DEFAULT 'local_server',
    source_kind TEXT NOT NULL DEFAULT 'keyword_only',
    input_chars INTEGER NOT NULL DEFAULT 0,
    output_chars INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    usage_units INTEGER NOT NULL DEFAULT 1,
    credit_charged INTEGER NOT NULL DEFAULT 0,
    credit_refunded INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    provider_job_id TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    retention_until TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_user_created ON ai_writing_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_provider_job ON ai_writing_usage_logs(provider_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_retention ON ai_writing_usage_logs(retention_until);

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

CREATE TABLE IF NOT EXISTS subscription_plans (
    plan_code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
    plan_code TEXT NOT NULL,
    entitlement_key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value_text TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (plan_code, entitlement_key),
    FOREIGN KEY (plan_code) REFERENCES subscription_plans(plan_code),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

INSERT OR IGNORE INTO subscription_plans(plan_code,display_name,description,sort_order,active,updated_at) VALUES
('free','Free','서비스 체험과 기본 이용',10,1,datetime('now')),
('plus','Plus','개인 블로그 운영을 위한 확장 기능',20,1,datetime('now')),
('pro','Pro','전문 콘텐츠 운영과 로컬 연동',30,1,datetime('now'));

INSERT OR IGNORE INTO plan_entitlements(plan_code,entitlement_key,value_type,value_text,updated_at) VALUES
('free','draft.max_count','integer','10',datetime('now')),('plus','draft.max_count','integer','100',datetime('now')),('pro','draft.max_count','integer','500',datetime('now')),
('free','instruction.max_profiles','integer','2',datetime('now')),('plus','instruction.max_profiles','integer','10',datetime('now')),('pro','instruction.max_profiles','integer','30',datetime('now')),
('free','persona.max_profiles','integer','1',datetime('now')),('plus','persona.max_profiles','integer','5',datetime('now')),('pro','persona.max_profiles','integer','20',datetime('now')),
('free','trend.portal.max_rank','integer','10',datetime('now')),('plus','trend.portal.max_rank','integer','20',datetime('now')),('pro','trend.portal.max_rank','integer','50',datetime('now')),
('free','trend.history_days','integer','0',datetime('now')),('plus','trend.history_days','integer','30',datetime('now')),('pro','trend.history_days','integer','90',datetime('now')),
('free','trend.naver.enabled','boolean','true',datetime('now')),('plus','trend.naver.enabled','boolean','true',datetime('now')),('pro','trend.naver.enabled','boolean','true',datetime('now')),
('free','trend.broadcast.enabled','boolean','true',datetime('now')),('plus','trend.broadcast.enabled','boolean','true',datetime('now')),('pro','trend.broadcast.enabled','boolean','true',datetime('now')),
('free','trend.season.enabled','boolean','true',datetime('now')),('plus','trend.season.enabled','boolean','true',datetime('now')),('pro','trend.season.enabled','boolean','true',datetime('now')),
('free','trend.stock.enabled','boolean','true',datetime('now')),('plus','trend.stock.enabled','boolean','true',datetime('now')),('pro','trend.stock.enabled','boolean','true',datetime('now')),
('free','trend.export.enabled','boolean','false',datetime('now')),('plus','trend.export.enabled','boolean','true',datetime('now')),('pro','trend.export.enabled','boolean','true',datetime('now')),
('free','integration.naver_helper.enabled','boolean','false',datetime('now')),('plus','integration.naver_helper.enabled','boolean','false',datetime('now')),('pro','integration.naver_helper.enabled','boolean','true',datetime('now')),
('free','ai.monthly_credits','integer','10',datetime('now')),('plus','ai.monthly_credits','integer','50',datetime('now')),('pro','ai.monthly_credits','integer','200',datetime('now')),
('free','ai.model_tier','enum','lite',datetime('now')),('plus','ai.model_tier','enum','flash',datetime('now')),('pro','ai.model_tier','enum','all',datetime('now'));
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
