const COOKIE_NAME = 'tc_session';
const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;
const DEFAULT_AI_INSTRUCTION_SECTIONS = Object.freeze({ absolute: true, selected: true, persona: true, conflict: true });
const DEFAULT_BILLING_SETTINGS = Object.freeze({ payment_enabled: false, donation_enabled: false, donation_url: '' });
const SERVICE_PLAN_CODES = Object.freeze(['free', 'plus', 'pro']);
const SERVICE_PLAN_DEFINITIONS = Object.freeze([
    { key: 'plan.sale_enabled', label: '요금제 판매', description: '회원에게 가입·업그레이드 가능한 요금제로 표시할지 설정', type: 'boolean' },
    { key: 'billing.monthly_price_krw', label: '월간 결제 금액', description: '회원에게 표시할 부가세 포함 월간 이용료', type: 'integer', min: 0, max: 10000000, unit: '원' },
    { key: 'billing.annual_price_krw', label: '연간 결제 금액', description: '회원에게 표시할 부가세 포함 연간 이용료', type: 'integer', min: 0, max: 100000000, unit: '원' },
    { key: 'draft.max_count', label: '미완의 글서랍 저장 개수', description: '회원이 미완의 글서랍에 보관할 수 있는 최대 원고 수', type: 'integer', min: 0, max: 10000, unit: '개' },
    { key: 'instruction.max_profiles', label: '개인 시스템 지침 저장 개수', description: '키워드·스토리 지침 프리셋을 합산한 최대 수', type: 'integer', min: 0, max: 100, unit: '개' },
    { key: 'persona.max_profiles', label: '페르소나 저장 개수', description: '개인 페르소나·톤앤매너 프리셋 최대 수', type: 'integer', min: 0, max: 100, unit: '개' },
    { key: 'trend.portal.max_rank', label: '포털 트렌드 제공 순위', description: '포털별 화면에 제공할 최대 순위', type: 'integer', min: 0, max: 100, unit: '위' },
    { key: 'trend.history_days', label: '트렌드 과거 조회 기간', description: '과거 트렌드 비교 허용 기간이며 0은 미제공', type: 'integer', min: 0, max: 3650, unit: '일' },
    { key: 'trend.naver.enabled', label: '네이버 검색어 트렌드', description: '네이버 검색어 비교 데이터 제공 여부', type: 'boolean' },
    { key: 'trend.broadcast.enabled', label: '방송 편성·시청률', description: '방송 편성과 시청률 데이터 제공 여부', type: 'boolean' },
    { key: 'trend.season.enabled', label: '시즌 황금 키워드', description: '축제·행사·영화·공연·OTT 데이터 제공 여부', type: 'boolean' },
    { key: 'trend.stock.enabled', label: '인기 검색 주식', description: '실시간 인기 검색 주식 데이터 제공 여부', type: 'boolean' },
    { key: 'trend.export.enabled', label: '트렌드 데이터 내보내기', description: 'CSV 등 데이터 내보내기 제공 여부', type: 'boolean' },
    { key: 'integration.naver_helper.enabled', label: '네이버 블로그 로컬 도우미', description: '로컬 도우미를 통한 네이버 글쓰기 화면 연결 제공 여부', type: 'boolean' },
    { key: 'ai.monthly_credits', label: '월 기본 글쓰기 건수', description: '구독 주기마다 기본 제공할 AI 글쓰기 건수', type: 'integer', min: 0, max: 1000000, unit: '건' },
    { key: 'ai.model_tier', label: 'AI 모델 제공 범위', description: '사용할 수 있는 AI 모델 등급', type: 'enum', options: [{ value: 'lite', label: 'Lite만' }, { value: 'flash', label: 'Flash 포함' }, { value: 'all', label: '전체 모델' }] },
]);
const DEFAULT_AI_MODEL_CATALOG = Object.freeze([
    { value: 'gemini-3.1-flash-lite', label: '라이트 · Flash Lite 3.1', tier: 'starter', title: '비용과 응답 속도를 우선하는 간단한 글쓰기', enabled: true, badge: '' },
    { value: 'gemini-3.5-flash-lite', label: '고속 · Flash Lite 3.5', tier: 'starter', title: '빠른 초안과 대량 글쓰기에 적합', enabled: true, badge: '추천' },
    { value: 'gemini-3.5-flash', label: '균형 · Flash 3.5', tier: 'standard', title: '속도와 글 품질의 균형', enabled: true, badge: '' },
    { value: 'gemini-3.6-flash', label: '고품질 · Flash 3.6', tier: 'standard', title: '더 정교한 구성과 표현', enabled: true, badge: '' },
    { value: 'gemini-3.7-flash', label: '최신 · Flash 3.7', tier: 'premium', title: '최신 고성능 Flash 글쓰기', enabled: true, badge: '응답 지연 가능' },
    { value: 'gemini-3.1-pro-preview', label: '전문가 · Pro 3.1 Preview', tier: 'premium', title: '복잡한 분석과 전문 원고용 Preview 모델', enabled: true, badge: '응답속도 느림' },
]);

function normalizeAiModelCatalog(value, includeHidden = true) {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (_) { value = []; }
    }
    const stored = new Map((Array.isArray(value) ? value : []).filter(item => item && typeof item === 'object').map(item => [String(item.value || ''), item]));
    const catalog = DEFAULT_AI_MODEL_CATALOG.map(defaultItem => {
        const override = stored.get(defaultItem.value) || {};
        return {
            ...defaultItem,
            enabled: 'enabled' in override ? Boolean(override.enabled) : defaultItem.enabled,
            badge: String(override.badge ?? defaultItem.badge).replace(/\s+/g, ' ').trim().slice(0, 20),
        };
    });
    if (!catalog.some(item => item.enabled)) catalog[1].enabled = true;
    return includeHidden ? catalog : catalog.filter(item => item.enabled);
}

function normalizeBillingSettings(value) {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (_) { value = {}; }
    }
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let donationUrl = String(value.donation_url || '').trim().slice(0, 2048);
    try {
        const parsed = new URL(donationUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) donationUrl = '';
        else donationUrl = parsed.href;
    } catch (_) {
        donationUrl = '';
    }
    return {
        payment_enabled: value.payment_enabled === true,
        donation_enabled: value.donation_enabled === true,
        donation_url: donationUrl,
    };
}

export async function getAiModelCatalog(env, includeHidden = false) {
    const row = await env.AUTH_DB.prepare(
        "SELECT setting_value FROM service_settings WHERE setting_key='ai_model_catalog'",
    ).first();
    return normalizeAiModelCatalog(row?.setting_value, includeHidden);
}

function parsePlanEntitlementValue(type, value) {
    if (type === 'boolean') return String(value).toLowerCase() === 'true';
    if (type === 'integer') return Number.parseInt(value, 10) || 0;
    return String(value || '');
}

function normalizePlanEntitlementInput(definition, value) {
    if (definition.type === 'boolean') return value === true || String(value).toLowerCase() === 'true' ? 'true' : 'false';
    if (definition.type === 'integer') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < definition.min || number > definition.max) {
            throw new Error(definition.label + ' 값은 ' + definition.min + '~' + definition.max + ' 범위의 정수여야 합니다.');
        }
        return String(number);
    }
    if (definition.type === 'enum') {
        const allowed = new Set((definition.options || []).map(option => option.value));
        if (!allowed.has(String(value))) throw new Error(definition.label + ' 값이 올바르지 않습니다.');
        return String(value);
    }
    throw new Error('지원하지 않는 서비스 등급 설정 형식입니다.');
}

async function getPlanEntitlements(env, planCode) {
    const normalizedPlan = SERVICE_PLAN_CODES.includes(String(planCode || '')) ? String(planCode) : 'free';
    const rows = await env.AUTH_DB.prepare(
        'SELECT entitlement_key,value_type,value_text FROM plan_entitlements WHERE plan_code=?',
    ).bind(normalizedPlan).all();
    return Object.fromEntries((rows.results || []).map(row => [
        row.entitlement_key,
        parsePlanEntitlementValue(row.value_type, row.value_text),
    ]));
}
async function publicServicePlans(env) {
    await ensureDatabase(env);
    const [plansResult, entitlementResult] = await env.AUTH_DB.batch([
        env.AUTH_DB.prepare('SELECT plan_code,display_name,description,sort_order FROM subscription_plans WHERE active=1 ORDER BY sort_order'),
        env.AUTH_DB.prepare('SELECT plan_code,entitlement_key,value_type,value_text FROM plan_entitlements ORDER BY plan_code,entitlement_key'),
    ]);
    const entitlements = Object.fromEntries(SERVICE_PLAN_CODES.map(code => [code, {}]));
    for (const row of entitlementResult.results || []) {
        entitlements[row.plan_code] ||= {};
        entitlements[row.plan_code][row.entitlement_key] = parsePlanEntitlementValue(row.value_type, row.value_text);
    }
    const plans = (plansResult.results || []).filter(plan => plan.plan_code === 'free'
        || entitlements[plan.plan_code]?.['plan.sale_enabled'] === true).map(plan => ({
        ...plan,
        entitlements: entitlements[plan.plan_code] || {},
    }));
    return response({ status: 'success', plans });
}
function normalizeAiInstructionSections(value) {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (_) { value = {}; }
    }
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(DEFAULT_AI_INSTRUCTION_SECTIONS).map(([key, enabled]) => [key, key in value ? Boolean(value[key]) : enabled]));
}

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member', plan_code TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'active',
        email_verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        last_login_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS otp_challenges (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, nickname TEXT NOT NULL,
        otp_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, consumed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_otp_challenges_email_created
        ON otp_challenges(email, created_at)`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        revoked_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash)`,
    `CREATE TABLE IF NOT EXISTS user_ai_preferences (
        user_id TEXT PRIMARY KEY, category_group TEXT NOT NULL DEFAULT '생활·노하우·쇼핑', category TEXT NOT NULL DEFAULT '일상·생각',
        persona TEXT NOT NULL DEFAULT '친근한 이웃 블로거',
        tone_level TEXT NOT NULL DEFAULT 'balanced', detail_level TEXT NOT NULL DEFAULT 'normal',
        custom_instruction TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_ai_persona_profiles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
        category_group TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', persona TEXT NOT NULL,
        tone_level TEXT NOT NULL DEFAULT 'balanced', detail_level TEXT NOT NULL DEFAULT 'normal',
        custom_instruction TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, UNIQUE (user_id, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_ai_persona_profiles_user_updated
        ON user_ai_persona_profiles(user_id, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS user_ai_persona_selections (
        user_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES user_ai_persona_profiles(id) ON DELETE CASCADE
    )`,
    `INSERT OR IGNORE INTO user_ai_persona_profiles
        (id,user_id,name,category_group,category,persona,tone_level,detail_level,custom_instruction,created_at,updated_at)
     SELECT 'legacy-persona:' || user_id,user_id,'기본 페르소나',category_group,category,persona,
        tone_level,detail_level,custom_instruction,updated_at,updated_at FROM user_ai_preferences
     WHERE NOT EXISTS (
        SELECT 1 FROM user_ai_persona_profiles p WHERE p.user_id=user_ai_preferences.user_id
     )`,
    `INSERT OR IGNORE INTO user_ai_persona_selections(user_id,profile_id,updated_at)
     SELECT user_id,'legacy-persona:' || user_id,updated_at FROM user_ai_preferences
     WHERE EXISTS (
        SELECT 1 FROM user_ai_persona_profiles p
        WHERE p.id='legacy-persona:' || user_ai_preferences.user_id
     )`,
    `CREATE TABLE IF NOT EXISTS user_ai_instructions (
        user_id TEXT NOT NULL, instruction_type TEXT NOT NULL,
        instruction TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, instruction_type), FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_ai_instruction_profiles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword','story')),
        name TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, instruction_type, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_ai_instruction_profiles_user_type
        ON user_ai_instruction_profiles(user_id, instruction_type, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS user_ai_instruction_selections (
        user_id TEXT NOT NULL, instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword','story')),
        profile_id TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, instruction_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES user_ai_instruction_profiles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_ai_instruction_usage (
        user_id TEXT NOT NULL, instruction_type TEXT NOT NULL CHECK (instruction_type IN ('keyword','story')),
        enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, instruction_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `INSERT OR IGNORE INTO user_ai_instruction_profiles
        (id,user_id,instruction_type,name,instruction,created_at,updated_at)
     SELECT 'legacy:' || user_id || ':' || instruction_type,user_id,instruction_type,
        CASE instruction_type WHEN 'story' THEN '기본 메모·스토리 지침' ELSE '기본 뉴스·키워드 지침' END,
        instruction,updated_at,updated_at FROM user_ai_instructions WHERE length(trim(instruction)) > 0`,
    `UPDATE user_ai_instruction_profiles
     SET name='기본 뉴스·키워드 지침'
     WHERE instruction_type='keyword' AND name='기본 키워드·뉴스 지침'
       AND NOT EXISTS (
           SELECT 1 FROM user_ai_instruction_profiles target
           WHERE target.user_id=user_ai_instruction_profiles.user_id
             AND target.instruction_type='keyword'
             AND target.name='기본 뉴스·키워드 지침'
       )`,
    `UPDATE user_ai_instruction_profiles
     SET name='새 뉴스·키워드 지침'
     WHERE instruction_type='keyword' AND name='새 키워드·뉴스 지침'
       AND NOT EXISTS (
           SELECT 1 FROM user_ai_instruction_profiles target
           WHERE target.user_id=user_ai_instruction_profiles.user_id
             AND target.instruction_type='keyword'
             AND target.name='새 뉴스·키워드 지침'
       )`,
    `INSERT OR IGNORE INTO user_ai_instruction_selections(user_id,instruction_type,profile_id,updated_at)
     SELECT user_id,instruction_type,'legacy:' || user_id || ':' || instruction_type,updated_at
     FROM user_ai_instructions WHERE length(trim(instruction)) > 0
       AND NOT EXISTS (
           SELECT 1 FROM user_ai_instruction_usage u
           WHERE u.user_id=user_ai_instructions.user_id
             AND u.instruction_type=user_ai_instructions.instruction_type
             AND u.enabled=0
       )`,
    `CREATE TABLE IF NOT EXISTS user_ai_instruction_sections (
        user_id TEXT PRIMARY KEY,
        absolute INTEGER NOT NULL DEFAULT 1, selected INTEGER NOT NULL DEFAULT 1,
        persona INTEGER NOT NULL DEFAULT 1, conflict INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_integration_preferences (
        user_id TEXT PRIMARY KEY, naver_blog_open_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_drafts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
        body_markdown TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT '', source_urls_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_drafts_user_updated ON user_drafts(user_id, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS user_ui_preferences (
        user_id TEXT PRIMARY KEY, font_family TEXT NOT NULL DEFAULT 'paperlogy',
        font_scale TEXT NOT NULL DEFAULT 'normal', font_weight TEXT NOT NULL DEFAULT '400',
        theme_mode TEXT NOT NULL DEFAULT 'system',
        updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_writing_credits (
        user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
        earned_total INTEGER NOT NULL DEFAULT 0, used_total INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS ai_background_jobs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress', credit_reserved INTEGER NOT NULL DEFAULT 0,
        credit_refunded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_background_jobs_user_created
        ON ai_background_jobs(user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_writing_usage_logs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        operation TEXT NOT NULL DEFAULT 'article', writing_mode TEXT NOT NULL DEFAULT 'keyword',
        model TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress',
        execution_type TEXT NOT NULL DEFAULT 'cloud_direct', source_kind TEXT NOT NULL DEFAULT 'keyword_only',
        input_chars INTEGER NOT NULL DEFAULT 0, output_chars INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0, usage_units INTEGER NOT NULL DEFAULT 1,
        credit_charged INTEGER NOT NULL DEFAULT 0, credit_refunded INTEGER NOT NULL DEFAULT 0, error_code TEXT NOT NULL DEFAULT '',
        provider_job_id TEXT, created_at TEXT NOT NULL, completed_at TEXT,
        updated_at TEXT NOT NULL, retention_until TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_user_created ON ai_writing_usage_logs(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_provider_job ON ai_writing_usage_logs(provider_job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_writing_usage_retention ON ai_writing_usage_logs(retention_until)`,
    `CREATE TABLE IF NOT EXISTS referral_claims (
        id TEXT PRIMARY KEY, referred_user_id TEXT NOT NULL UNIQUE,
        referrer_user_id TEXT NOT NULL, reward_count INTEGER NOT NULL DEFAULT 10,
        created_at TEXT NOT NULL, FOREIGN KEY (referred_user_id) REFERENCES users(id),
        FOREIGN KEY (referrer_user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer ON referral_claims(referrer_user_id)`,
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY, admin_user_id TEXT NOT NULL, action TEXT NOT NULL,
        target_user_id TEXT, before_value TEXT NOT NULL DEFAULT '',
        after_value TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, FOREIGN KEY (admin_user_id) REFERENCES users(id),
        FOREIGN KEY (target_user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at)`,
    `CREATE TABLE IF NOT EXISTS service_settings (
        setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL, updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS subscription_plans (
        plan_code TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, updated_by TEXT, FOREIGN KEY (updated_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS plan_entitlements (
        plan_code TEXT NOT NULL, entitlement_key TEXT NOT NULL, value_type TEXT NOT NULL,
        value_text TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
        PRIMARY KEY (plan_code, entitlement_key),
        FOREIGN KEY (plan_code) REFERENCES subscription_plans(plan_code),
        FOREIGN KEY (updated_by) REFERENCES users(id)
    )`,
    `INSERT OR IGNORE INTO subscription_plans(plan_code,display_name,description,sort_order,active,updated_at) VALUES
        ('free','Free','서비스 체험과 기본 이용',10,1,datetime('now')),
        ('plus','Plus','개인 블로그 운영을 위한 확장 기능',20,1,datetime('now')),
        ('pro','Pro','전문 콘텐츠 운영과 로컬 연동',30,1,datetime('now'))`,
    `INSERT OR IGNORE INTO plan_entitlements(plan_code,entitlement_key,value_type,value_text,updated_at) VALUES
        ('free','plan.sale_enabled','boolean','true',datetime('now')),('plus','plan.sale_enabled','boolean','true',datetime('now')),('pro','plan.sale_enabled','boolean','true',datetime('now')),
        ('free','billing.monthly_price_krw','integer','0',datetime('now')),('plus','billing.monthly_price_krw','integer','9900',datetime('now')),('pro','billing.monthly_price_krw','integer','19900',datetime('now')),
        ('free','billing.annual_price_krw','integer','0',datetime('now')),('plus','billing.annual_price_krw','integer','99000',datetime('now')),('pro','billing.annual_price_krw','integer','199000',datetime('now')),
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
        ('free','ai.model_tier','enum','lite',datetime('now')),('plus','ai.model_tier','enum','flash',datetime('now')),('pro','ai.model_tier','enum','all',datetime('now'))`,    `CREATE TABLE IF NOT EXISTS role_feature_permissions (
        role TEXT NOT NULL, feature_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY(role, feature_key)
    )`,
    `INSERT OR IGNORE INTO role_feature_permissions(role, feature_key, enabled, updated_at) VALUES
        ('member','dashboard.extended',1,datetime('now')),('member','trend.naver',1,datetime('now')),('member','studio.access',1,datetime('now')),('member','ai.write',1,datetime('now')),('member','ai.personalize',1,datetime('now')),('member','billing.access',1,datetime('now')),('member','admin.members',0,datetime('now')),('member','admin.permissions',0,datetime('now')),('member','admin.service_plans',0,datetime('now')),('member','admin.billing_settings',0,datetime('now')),('member','admin.system_settings',0,datetime('now')),
        ('premium','dashboard.extended',1,datetime('now')),('premium','trend.naver',1,datetime('now')),('premium','studio.access',1,datetime('now')),('premium','ai.write',1,datetime('now')),('premium','ai.personalize',1,datetime('now')),('premium','billing.access',1,datetime('now')),('premium','admin.members',0,datetime('now')),('premium','admin.permissions',0,datetime('now')),('premium','admin.service_plans',0,datetime('now')),('premium','admin.billing_settings',0,datetime('now')),('premium','admin.system_settings',0,datetime('now')),
        ('operator','dashboard.extended',1,datetime('now')),('operator','trend.naver',1,datetime('now')),('operator','studio.access',1,datetime('now')),('operator','ai.write',1,datetime('now')),('operator','ai.personalize',1,datetime('now')),('operator','billing.access',1,datetime('now')),('operator','admin.members',1,datetime('now')),('operator','admin.permissions',0,datetime('now')),('operator','admin.service_plans',0,datetime('now')),('operator','admin.billing_settings',0,datetime('now')),('operator','admin.system_settings',0,datetime('now')),
        ('admin','dashboard.extended',1,datetime('now')),('admin','trend.naver',1,datetime('now')),('admin','studio.access',1,datetime('now')),('admin','ai.write',1,datetime('now')),('admin','ai.personalize',1,datetime('now')),('admin','billing.access',1,datetime('now')),('admin','admin.members',1,datetime('now')),('admin','admin.permissions',1,datetime('now')),('admin','admin.service_plans',1,datetime('now')),('admin','admin.billing_settings',1,datetime('now')),('admin','admin.system_settings',1,datetime('now'))`,
    `UPDATE role_feature_permissions SET enabled=0, updated_at=datetime('now')
     WHERE role!='admin' AND feature_key IN ('admin.permissions','admin.service_plans','admin.billing_settings','admin.system_settings')`,
];

// 새 테이블이나 마이그레이션을 SCHEMA_STATEMENTS에 추가하면 반드시 이 값을 갱신한다.
// 운영 D1은 이 값이 같으면 전체 스키마 초기화를 건너뛴다.
const DATABASE_SCHEMA_VERSION = '20260830-plan-pricing-v3';

function response(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...extraHeaders,
        },
    });
}

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('올바른 이메일 주소를 입력해 주세요.');
    }
    return email;
}

function normalizeNickname(value) {
    const nickname = String(value || '').trim().replace(/\s+/g, ' ');
    if (nickname.length < 2 || nickname.length > 30) {
        throw new Error('닉네임은 2~30자로 입력해 주세요.');
    }
    return nickname;
}

function nowIso() {
    return new Date().toISOString();
}

function addSeconds(seconds) {
    return new Date(Date.now() + seconds * 1000).toISOString();
}

function bytesToHex(bytes) {
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function secureHash(secret, ...parts) {
    const input = new TextEncoder().encode(`${secret}|${parts.join('|')}`);
    return bytesToHex(await crypto.subtle.digest('SHA-256', input));
}

function randomDigits() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return String(values[0] % 1000000).padStart(6, '0');
}

function randomToken() {
    const values = new Uint8Array(32);
    crypto.getRandomValues(values);
    return btoa(String.fromCharCode(...values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readCookie(request, name) {
    const cookie = request.headers.get('Cookie') || '';
    for (const part of cookie.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return '';
}

let databaseReadyPromise = null;
let databaseReadyBinding = null;

async function initializeDatabase(env) {
    if (!env.AUTH_DB) throw new Error('Cloudflare D1 바인딩 AUTH_DB가 설정되지 않았습니다.');
    try {
        const schemaState = await env.AUTH_DB.prepare(
            "SELECT setting_value FROM service_settings WHERE setting_key='database_schema_version'",
        ).first();
        if (schemaState?.setting_value === DATABASE_SCHEMA_VERSION) return;
    } catch (_) {
        // 최초 구축 DB는 service_settings가 아직 없으므로 전체 스키마를 생성한다.
    }
    await env.AUTH_DB.batch(SCHEMA_STATEMENTS.map((sql) => env.AUTH_DB.prepare(sql)));
    const userColumns = await env.AUTH_DB.prepare("PRAGMA table_info(users)").all();
    if (!(userColumns.results || []).some((column) => column.name === 'plan_code')) {
        await env.AUTH_DB.prepare("ALTER TABLE users ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'free'").run();
        await env.AUTH_DB.prepare("UPDATE users SET plan_code='pro' WHERE role='premium' AND plan_code='free'").run();
    }

    const preferenceColumns = await env.AUTH_DB.prepare("PRAGMA table_info(user_ai_preferences)").all();
    if (!(preferenceColumns.results || []).some((column) => column.name === 'enabled')) {
        await env.AUTH_DB.prepare("ALTER TABLE user_ai_preferences ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1").run();
    }
    if (!(preferenceColumns.results || []).some((column) => column.name === 'category_group')) {
        await env.AUTH_DB.prepare("ALTER TABLE user_ai_preferences ADD COLUMN category_group TEXT NOT NULL DEFAULT '생활·노하우·쇼핑'").run();
    }
    const integrationColumns = await env.AUTH_DB.prepare("PRAGMA table_info(user_integration_preferences)").all();
    if (!(integrationColumns.results || []).some((column) => column.name === 'naver_blog_open_enabled')) {
        await env.AUTH_DB.prepare(
            'ALTER TABLE user_integration_preferences ADD COLUMN naver_blog_open_enabled INTEGER NOT NULL DEFAULT 1',
        ).run();
    }
    const usageColumns = await env.AUTH_DB.prepare("PRAGMA table_info(ai_writing_usage_logs)").all();
    if (!(usageColumns.results || []).some((column) => column.name === 'credit_refunded')) {
        await env.AUTH_DB.prepare(
            'ALTER TABLE ai_writing_usage_logs ADD COLUMN credit_refunded INTEGER NOT NULL DEFAULT 0',
        ).run();
    }
    await env.AUTH_DB.prepare(
        `INSERT OR IGNORE INTO ai_writing_usage_logs
         (id,user_id,operation,writing_mode,model,status,execution_type,source_kind,input_chars,output_chars,
          duration_ms,usage_units,credit_charged,credit_refunded,error_code,provider_job_id,
          created_at,completed_at,updated_at,retention_until)
         SELECT 'legacy:' || id,user_id,'article','keyword',model,status,'cloud_background','unknown',0,0,0,1,
                credit_reserved,credit_refunded,'',id,created_at,
                CASE WHEN lower(status) IN ('completed','failed','cancelled','canceled','incomplete','budget_exceeded','timed_out') THEN updated_at ELSE NULL END,
                updated_at,strftime('%Y-%m-%dT%H:%M:%SZ',created_at,'+400 days')
         FROM ai_background_jobs`,
    ).run();
    const uiColumns = await env.AUTH_DB.prepare("PRAGMA table_info(user_ui_preferences)").all();
    if (!(uiColumns.results || []).some((column) => column.name === 'theme_mode')) {
        await env.AUTH_DB.prepare(
            "ALTER TABLE user_ui_preferences ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system'",
        ).run();
    }
    await env.AUTH_DB.prepare('DELETE FROM ai_writing_usage_logs WHERE retention_until < ?').bind(nowIso()).run();
    await env.AUTH_DB.prepare(
        "UPDATE role_feature_permissions SET enabled=1, updated_at=? WHERE role='admin'",
    ).bind(nowIso()).run();
    const primaryAdminEmail = String(env.PRIMARY_ADMIN_EMAIL || 'ihnseob@naver.com').trim().toLowerCase();
    if (primaryAdminEmail) {
        await env.AUTH_DB.prepare(
            "UPDATE users SET role='admin', updated_at=? WHERE lower(email)=? AND role!='admin'",
        ).bind(nowIso(), primaryAdminEmail).run();
    }
    await env.AUTH_DB.prepare(
        `INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
         VALUES('database_schema_version',?,?,NULL)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=NULL`,
    ).bind(DATABASE_SCHEMA_VERSION, nowIso()).run();
}

async function ensureDatabase(env) {
    if (!env.AUTH_DB) throw new Error('Cloudflare D1 바인딩 AUTH_DB가 설정되지 않았습니다.');
    if (databaseReadyBinding === env.AUTH_DB && databaseReadyPromise) return databaseReadyPromise;

    databaseReadyBinding = env.AUTH_DB;
    databaseReadyPromise = initializeDatabase(env).catch((error) => {
        databaseReadyPromise = null;
        databaseReadyBinding = null;
        throw error;
    });
    return databaseReadyPromise;
}

function authSecret(env) {
    if (!env.AUTH_SECRET || String(env.AUTH_SECRET).length < 24) {
        throw new Error('Cloudflare Secret AUTH_SECRET을 24자 이상으로 설정해 주세요.');
    }
    return String(env.AUTH_SECRET);
}

async function sendOtpEmail(env, email, otp) {
    if (!env.RESEND_API_KEY || !env.OTP_FROM_EMAIL) {
        throw new Error('RESEND_API_KEY와 OTP_FROM_EMAIL 설정이 필요합니다.');
    }
    const subject = '[트래픽캐쳐 | Traffic Catcher] 로그인 인증번호가 발송되었습니다.';
    const text = `안녕하세요, 트래픽캐쳐(Traffic Catcher) 입니다.

계정 보호를 위해 요청하신 로그인 인증번호를 안내해 드립니다.

인증번호: ${otp}
유효시간: 발송 후 5분 이내

인증번호는 타인에게 절대로 알려주지 마세요. 본인이 요청하지 않은 경우, 이 메일을 무시하시고 계정 보안을 점검해 주시기 바랍니다.

트래픽캐쳐 | Traffic Catcher`;
    const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:0;background:#f8fafc;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <div style="padding:32px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
    <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">안녕하세요, <strong>트래픽캐쳐(Traffic Catcher)</strong> 입니다.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">계정 보호를 위해 요청하신 로그인 인증번호를 안내해 드립니다.</p>
    <div style="margin:0 0 24px;padding:20px;border-radius:12px;background:#eff6ff;">
      <p style="margin:0 0 10px;font-size:15px;"><strong>인증번호:</strong> <span style="font-size:24px;font-weight:700;letter-spacing:4px;color:#2563eb;">${otp}</span></p>
      <p style="margin:0;font-size:15px;"><strong>유효시간:</strong> 발송 후 5분 이내</p>
    </div>
    <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#64748b;">인증번호는 타인에게 절대로 알려주지 마세요. 본인이 요청하지 않은 경우, 이 메일을 무시하시고 계정 보안을 점검해 주시기 바랍니다.</p>
    <p style="margin:0;font-size:14px;font-weight:600;color:#475569;">트래픽캐쳐 | Traffic Catcher</p>
  </div>
</div></body></html>`;
    const mailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.OTP_FROM_EMAIL,
            to: [email],
            subject,
            text,
            html,
        }),
    });
    if (!mailResponse.ok) {
        const detail = await mailResponse.text();
        throw new Error(`메일 서비스 오류 (${mailResponse.status}): ${detail.slice(0, 160)}`);
    }
}

function serializeUser(user) {
    return {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        plan_code: user.plan_code || 'free',
        email_verified_at: user.email_verified_at,
    };
}

async function requestOtp(request, env) {
    const payload = await request.json().catch(() => ({}));
    let email;
    let nickname;
    try {
        email = normalizeEmail(payload.email);
        nickname = normalizeNickname(payload.nickname);
        await ensureDatabase(env);
    } catch (error) {
        const configurationError = /AUTH_DB|AUTH_SECRET/.test(error.message);
        return response({ status: 'error', message: error.message }, configurationError ? 503 : 400);
    }

    const latest = await env.AUTH_DB.prepare(
        'SELECT created_at FROM otp_challenges WHERE email = ? ORDER BY created_at DESC LIMIT 1',
    ).bind(email).first();
    if (latest) {
        const elapsed = Math.floor((Date.now() - Date.parse(latest.created_at)) / 1000);
        const retryAfter = OTP_RESEND_SECONDS - elapsed;
        if (retryAfter > 0) {
            return response({
                status: 'rate_limited',
                message: `${retryAfter}초 후 인증번호를 다시 요청해 주세요.`,
                retry_after: retryAfter,
            }, 429);
        }
    }

    let secret;
    try {
        secret = authSecret(env);
    } catch (error) {
        return response({ status: 'error', message: error.message }, 503);
    }
    const challengeId = crypto.randomUUID();
    const otp = randomDigits();
    const createdAt = nowIso();
    const otpHash = await secureHash(secret, 'otp', challengeId, email, otp);
    await env.AUTH_DB.prepare(
        `INSERT INTO otp_challenges
         (id, email, nickname, otp_hash, expires_at, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).bind(challengeId, email, nickname, otpHash, addSeconds(OTP_TTL_SECONDS), createdAt).run();

    try {
        await sendOtpEmail(env, email, otp);
    } catch (error) {
        await env.AUTH_DB.prepare('DELETE FROM otp_challenges WHERE id = ?').bind(challengeId).run();
        return response({ status: 'error', message: `인증 메일 발송에 실패했습니다: ${error.message}` }, 502);
    }
    return response({
        status: 'success',
        message: '입력한 이메일로 6자리 인증번호를 보냈습니다.',
        challenge_id: challengeId,
        expires_in: OTP_TTL_SECONDS,
        delivery: 'email',
    });
}

async function verifyOtp(request, env) {
    const payload = await request.json().catch(() => ({}));
    const challengeId = String(payload.challenge_id || '').trim();
    const otp = String(payload.otp || '').replace(/\D/g, '');
    if (!challengeId || otp.length !== 6) {
        return response({ status: 'error', message: '6자리 인증번호를 입력해 주세요.' }, 400);
    }
    try {
        await ensureDatabase(env);
    } catch (error) {
        return response({ status: 'error', message: error.message }, 503);
    }
    const challenge = await env.AUTH_DB.prepare('SELECT * FROM otp_challenges WHERE id = ?').bind(challengeId).first();
    const current = nowIso();
    if (!challenge || challenge.consumed_at) {
        return response({ status: 'error', message: '유효하지 않거나 이미 사용한 인증 요청입니다.' }, 400);
    }
    if (challenge.expires_at <= current) {
        return response({ status: 'expired', message: '인증번호가 만료되었습니다. 다시 요청해 주세요.' }, 410);
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        return response({ status: 'locked', message: '입력 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.' }, 429);
    }
    const expected = await secureHash(authSecret(env), 'otp', challengeId, challenge.email, otp);
    if (expected !== challenge.otp_hash) {
        await env.AUTH_DB.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challengeId).run();
        return response({ status: 'error', message: '인증번호가 올바르지 않습니다.' }, 401);
    }

    let user = await env.AUTH_DB.prepare('SELECT * FROM users WHERE email = ?').bind(challenge.email).first();
    let userId = user?.id;
    if (user) {
        await env.AUTH_DB.prepare(
            'UPDATE users SET nickname = ?, email_verified_at = ?, updated_at = ?, last_login_at = ? WHERE id = ?',
        ).bind(challenge.nickname, current, current, current, userId).run();
    } else {
        userId = crypto.randomUUID();
        await env.AUTH_DB.prepare(
            `INSERT INTO users
             (id, email, nickname, role, status, email_verified_at, created_at, updated_at, last_login_at)
             VALUES (?, ?, ?, 'member', 'active', ?, ?, ?, ?)`,
        ).bind(userId, challenge.email, challenge.nickname, current, current, current, current).run();
    }
    await env.AUTH_DB.prepare('UPDATE otp_challenges SET consumed_at = ? WHERE id = ?').bind(current, challengeId).run();

    const sessionToken = randomToken();
    const tokenHash = await secureHash(authSecret(env), 'session', sessionToken);
    await env.AUTH_DB.prepare(
        `INSERT INTO auth_sessions
         (id, user_id, token_hash, expires_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, tokenHash, addSeconds(SESSION_DAYS * 86400), current, current).run();
    user = await env.AUTH_DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return response(
        { status: 'success', message: '로그인되었습니다.', user: serializeUser(user) },
        200,
        { 'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax` },
    );
}

async function sessionStatus(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'anonymous', authenticated: false });
    try {
        await ensureDatabase(env);
        const hash = await secureHash(authSecret(env), 'session', token);
        const user = await env.AUTH_DB.prepare(
            `SELECT u.id, u.email, u.nickname, u.role, u.plan_code, u.email_verified_at, s.id AS session_id
             FROM auth_sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.revoked_at IS NULL
               AND s.expires_at > ? AND u.status = 'active'`,
        ).bind(hash, nowIso()).first();
        if (!user) return response({ status: 'anonymous', authenticated: false });
        const current = nowIso();
        const seenThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await env.AUTH_DB.prepare(
            'UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)',
        ).bind(current, user.session_id, seenThreshold).run();
        const [permissionRows, entitlements, billingRow] = await Promise.all([
            env.AUTH_DB.prepare('SELECT feature_key, enabled FROM role_feature_permissions WHERE role=?').bind(user.role).all(),
            getPlanEntitlements(env, user.plan_code),
            env.AUTH_DB.prepare("SELECT setting_value FROM service_settings WHERE setting_key='billing_features'").first(),
        ]);
        const permissions = Object.fromEntries((permissionRows.results || []).map((row) => [row.feature_key, Boolean(row.enabled)]));
        return response({
            status: 'success', authenticated: true, user: serializeUser(user), permissions, entitlements,
            billing_settings: normalizeBillingSettings(billingRow?.setting_value),
        });
    } catch (error) {
        return response({ status: 'error', authenticated: false, message: error.message }, 503);
    }
}

async function logout(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (token && env.AUTH_DB && env.AUTH_SECRET) {
        const hash = await secureHash(authSecret(env), 'session', token);
        await env.AUTH_DB.prepare(
            'UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
        ).bind(nowIso(), hash).run();
    }
    return response(
        { status: 'success', message: '로그아웃되었습니다.' },
        200,
        { 'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` },
    );
}

export async function getAuthenticatedUser(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return null;
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    return env.AUTH_DB.prepare(
        `SELECT u.id, u.email, u.nickname, u.role, u.plan_code FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL
           AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
}

export async function hasFeature(env, user, featureKey) {
    if (!user) return false;
    const row = await env.AUTH_DB.prepare('SELECT enabled FROM role_feature_permissions WHERE role=? AND feature_key=?')
        .bind(user.role, featureKey).first();
    return Boolean(row?.enabled);
}

async function aiPersonaPreferences(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    const user = await env.AUTH_DB.prepare(
        `SELECT u.id, u.role, u.plan_code FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (request.method === 'GET') {
        const preference = await env.AUTH_DB.prepare(
            `SELECT category_group, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at
             FROM user_ai_preferences WHERE user_id = ?`,
        ).bind(user.id).first();
        return response({ status: 'success', preference: preference || null });
    }
    const payload = await request.json().catch(() => ({}));
    const categoryGroup = String(payload.category_group || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const category = String(payload.category || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const persona = String(payload.persona || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const toneLevel = String(payload.tone_level || 'balanced');
    const detailLevel = String(payload.detail_level || 'normal');
    const customInstruction = String(payload.custom_instruction || '').trim();
    const enabled = payload.enabled === false ? 0 : 1;
    if (!categoryGroup || !persona || (categoryGroup !== '주제 선택 안 함' && !category)) return response({ status: 'error', message: '작성 카테고리와 페르소나를 선택해 주세요.' }, 400);
    if (!['calm', 'balanced', 'lively'].includes(toneLevel) || !['concise', 'normal', 'detailed'].includes(detailLevel)) {
        return response({ status: 'error', message: '지원하지 않는 개인화 설정입니다.' }, 400);
    }
    if (customInstruction.length > 2000) return response({ status: 'error', message: '개인 지침은 2,000자 이내로 입력해 주세요.' }, 400);
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ai_preferences
         (user_id, category_group, category, persona, tone_level, detail_level, custom_instruction, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET category_group=excluded.category_group,
         category=excluded.category, persona=excluded.persona,
         tone_level=excluded.tone_level, detail_level=excluded.detail_level,
         custom_instruction=excluded.custom_instruction, enabled=excluded.enabled,
         updated_at=excluded.updated_at`,
    ).bind(user.id, categoryGroup, category, persona, toneLevel, detailLevel, customInstruction, enabled, updatedAt).run();
    return response({ status: 'success', message: 'AI 페르소나·톤앤매너 설정을 저장했습니다.', updated_at: updatedAt });
}

function normalizePersonaProfile(payload) {
    const categoryGroup = String(payload.category_group || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const category = String(payload.category || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const persona = String(payload.persona || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const toneLevel = String(payload.tone_level || 'balanced');
    const detailLevel = String(payload.detail_level || 'normal');
    const customInstruction = String(payload.custom_instruction || '').trim();
    if (!categoryGroup || !persona || (categoryGroup !== '주제 선택 안 함' && !category)) throw new Error('작성 카테고리와 페르소나를 선택해 주세요.');
    if (!['calm', 'balanced', 'lively'].includes(toneLevel) || !['concise', 'normal', 'detailed'].includes(detailLevel)) throw new Error('지원하지 않는 개인화 설정입니다.');
    if (customInstruction.length > 2000) throw new Error('개인 지침은 2,000자 이내로 입력해 주세요.');
    return { categoryGroup, category, persona, toneLevel, detailLevel, customInstruction };
}

function personaProfileName(value) {
    const name = String(value || '새 페르소나').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 60) throw new Error('페르소나 이름은 2~60자로 입력해 주세요.');
    return name;
}

async function personaProfileState(env, userId, limit) {
    const result = await env.AUTH_DB.prepare(
        `SELECT p.id,p.name,p.category_group,p.category,p.persona,p.tone_level,p.detail_level,
                p.custom_instruction,p.created_at,p.updated_at,
                CASE WHEN s.profile_id=p.id THEN 1 ELSE 0 END AS is_active
         FROM user_ai_persona_profiles p
         LEFT JOIN user_ai_persona_selections s ON s.user_id=p.user_id
         WHERE p.user_id=? ORDER BY is_active DESC,p.updated_at DESC,p.name`,
    ).bind(userId).all();
    const profiles = result.results || [];
    return {
        profiles,
        active_profile_id: profiles.find(item => Number(item.is_active) === 1)?.id || null,
        count: profiles.length,
        limit,
        remaining: Math.max(0, limit - profiles.length),
    };
}

async function applyPersonaProfile(env, userId, profileId, current) {
    const profile = await env.AUTH_DB.prepare(
        `SELECT category_group,category,persona,tone_level,detail_level,custom_instruction
         FROM user_ai_persona_profiles WHERE id=? AND user_id=?`,
    ).bind(profileId, userId).first();
    if (!profile) return false;
    const preference = await env.AUTH_DB.prepare(
        'SELECT enabled FROM user_ai_preferences WHERE user_id=?',
    ).bind(userId).first();
    await env.AUTH_DB.batch([
        env.AUTH_DB.prepare(
            `INSERT INTO user_ai_persona_selections(user_id,profile_id,updated_at)
             VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_id=excluded.profile_id,updated_at=excluded.updated_at`,
        ).bind(userId, profileId, current),
        env.AUTH_DB.prepare(
            `INSERT INTO user_ai_preferences
             (user_id,category_group,category,persona,tone_level,detail_level,custom_instruction,enabled,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
             category_group=excluded.category_group,category=excluded.category,persona=excluded.persona,
             tone_level=excluded.tone_level,detail_level=excluded.detail_level,
             custom_instruction=excluded.custom_instruction,updated_at=excluded.updated_at`,
        ).bind(userId, profile.category_group, profile.category, profile.persona, profile.tone_level,
            profile.detail_level, profile.custom_instruction, preference ? Number(preference.enabled) : 1, current),
    ]);
    return true;
}

async function personaProfiles(request, env) {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    const entitlements = await getPlanEntitlements(env, user.plan_code);
    const configured = Math.max(0, Number(entitlements['persona.max_profiles'] || 0));
    const limit = configured;
    if (request.method === 'GET') return response({ status: 'success', ...await personaProfileState(env, user.id, limit) });
    if (!sameOrigin(request)) return response({ status: 'error', message: '허용되지 않은 요청 출처입니다.' }, 403);
    const payload = ['POST', 'PUT'].includes(request.method) ? await request.json().catch(() => ({})) : {};
    const url = new URL(request.url);
    const id = String(url.searchParams.get('id') || payload.id || '').trim();
    const current = nowIso();
    try {
        let profileId = id;
        let message = '';
        if (request.method === 'POST') {
            const state = await personaProfileState(env, user.id, limit);
            if (state.count >= limit) return response({
                status: 'error', code: 'PERSONA_PROFILE_LIMIT_REACHED',
                message: '저장 한도(권한 등급)가 초과되었습니다. 기존 페르소나는 유지되며 새 페르소나만 추가할 수 없습니다.',
                count: state.count, limit,
            }, 409);
            const name = personaProfileName(payload.name);
            const value = normalizePersonaProfile(payload);
            profileId = crypto.randomUUID();
            await env.AUTH_DB.prepare(
                `INSERT INTO user_ai_persona_profiles
                 (id,user_id,name,category_group,category,persona,tone_level,detail_level,custom_instruction,created_at,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(profileId, user.id, name, value.categoryGroup, value.category, value.persona,
                value.toneLevel, value.detailLevel, value.customInstruction, current, current).run();
            const shouldActivate = payload.activate !== false;
            if (shouldActivate) await applyPersonaProfile(env, user.id, profileId, current);
            message = shouldActivate ? '새 페르소나를 저장하고 적용했습니다.' : '페르소나 복사본을 저장했습니다.';
        } else {
            if (!profileId) return response({ status: 'error', message: request.method === 'DELETE' ? '삭제할 페르소나를 선택해 주세요.' : '수정할 페르소나를 선택해 주세요.' }, 400);
            const owned = await env.AUTH_DB.prepare(
                'SELECT id FROM user_ai_persona_profiles WHERE id=? AND user_id=?',
            ).bind(profileId, user.id).first();
            if (!owned) return response({ status: 'error', message: '페르소나를 찾을 수 없습니다.' }, 404);
            if (request.method === 'DELETE') {
                const selected = await env.AUTH_DB.prepare(
                    'SELECT profile_id FROM user_ai_persona_selections WHERE user_id=?',
                ).bind(user.id).first();
                await env.AUTH_DB.prepare(
                    'DELETE FROM user_ai_persona_profiles WHERE id=? AND user_id=?',
                ).bind(profileId, user.id).run();
                if (selected?.profile_id === profileId) {
                    const replacement = await env.AUTH_DB.prepare(
                        'SELECT id FROM user_ai_persona_profiles WHERE user_id=? ORDER BY updated_at DESC LIMIT 1',
                    ).bind(user.id).first();
                    if (replacement) await applyPersonaProfile(env, user.id, replacement.id, current);
                    else {
                        await env.AUTH_DB.batch([
                            env.AUTH_DB.prepare('DELETE FROM user_ai_persona_selections WHERE user_id=?').bind(user.id),
                            env.AUTH_DB.prepare('DELETE FROM user_ai_preferences WHERE user_id=?').bind(user.id),
                        ]);
                    }
                }
                message = '페르소나를 삭제했습니다.';
            } else if (payload.action === 'activate') {
                await applyPersonaProfile(env, user.id, profileId, current);
                message = '선택한 페르소나를 적용했습니다.';
            } else {
                const name = personaProfileName(payload.name);
                const value = normalizePersonaProfile(payload);
                await env.AUTH_DB.prepare(
                    `UPDATE user_ai_persona_profiles SET name=?,category_group=?,category=?,persona=?,
                     tone_level=?,detail_level=?,custom_instruction=?,updated_at=? WHERE id=? AND user_id=?`,
                ).bind(name, value.categoryGroup, value.category, value.persona, value.toneLevel,
                    value.detailLevel, value.customInstruction, current, profileId, user.id).run();
                const selected = await env.AUTH_DB.prepare(
                    'SELECT 1 AS active FROM user_ai_persona_selections WHERE user_id=? AND profile_id=?',
                ).bind(user.id, profileId).first();
                if (selected || payload.activate !== false) await applyPersonaProfile(env, user.id, profileId, current);
                message = '페르소나를 수정하고 적용했습니다.';
            }
        }
        return response({ status: 'success', message, profile_id: profileId, ...await personaProfileState(env, user.id, limit) });
    } catch (error) {
        const message = String(error?.message || error);
        if (/UNIQUE|constraint/i.test(message)) return response({ status: 'error', message: '같은 이름의 페르소나가 이미 있습니다.' }, 409);
        if (/입력해 주세요|지원하지 않는|2,000자/.test(message)) return response({ status: 'error', message }, 400);
        throw error;
    }
}

async function personalAiInstructionSections(request, env) {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) {
        return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    }
    if (request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            'SELECT absolute, selected, persona, conflict FROM user_ai_instruction_sections WHERE user_id = ?',
        ).bind(user.id).first();
        return response({ status: 'success', sections: normalizeAiInstructionSections(row) });
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) {
        return response({ status: 'error', message: '허용되지 않은 요청 출처입니다.' }, 403);
    }
    const payload = await request.json().catch(() => ({}));
    const rawSections = payload.sections;
    const allowedKeys = Object.keys(DEFAULT_AI_INSTRUCTION_SECTIONS);
    if (!rawSections || typeof rawSections !== 'object' || Array.isArray(rawSections)
        || Object.keys(rawSections).length !== allowedKeys.length
        || Object.keys(rawSections).some(key => !allowedKeys.includes(key))) {
        return response({ status: 'error', message: '지원하지 않는 AI 지침 구성입니다.' }, 400);
    }
    const sections = normalizeAiInstructionSections(rawSections);
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ai_instruction_sections
         (user_id, absolute, selected, persona, conflict, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET absolute=excluded.absolute,
         selected=excluded.selected, persona=excluded.persona,
         conflict=excluded.conflict, updated_at=excluded.updated_at`,
    ).bind(user.id, Number(sections.absolute), Number(sections.selected),
        Number(sections.persona), Number(sections.conflict), updatedAt).run();
    return response({
        status: 'success',
        message: '개인 AI 전달 구성을 저장했습니다.',
        sections,
        updated_at: updatedAt,
    });
}

async function integrationPreferences(request, env) {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    const entitlements = await getPlanEntitlements(env, user.plan_code);
    const available = user.role === 'admin' || entitlements['integration.naver_helper.enabled'] === true;
    if (request.method === 'GET') {
        const preference = await env.AUTH_DB.prepare(
            'SELECT naver_blog_open_enabled, updated_at FROM user_integration_preferences WHERE user_id = ?',
        ).bind(user.id).first();
        return response({ status: 'success', eligible: available, available, preference: {
            naver_blog_open_enabled: available && (preference ? Boolean(preference.naver_blog_open_enabled) : true),
            updated_at: preference?.updated_at || null,
        }});
    }
    if (!available) return response({ status: 'error', message: '현재 서비스 등급에는 네이버 블로그 로컬 도우미가 제공되지 않습니다.' }, 403);
    if (!sameOrigin(request)) return response({ status: 'error', message: '허용되지 않은 요청 출처입니다.' }, 403);
    const payload = await request.json().catch(() => ({}));
    const enabled = payload.naver_blog_open_enabled !== false;
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_integration_preferences (user_id, naver_blog_open_enabled, updated_at)
         VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
         naver_blog_open_enabled=excluded.naver_blog_open_enabled, updated_at=excluded.updated_at`,
    ).bind(user.id, enabled ? 1 : 0, updatedAt).run();
    return response({ status: 'success', message: '네이버 글쓰기 열기 설정을 저장했습니다.', eligible: true, available: true,
        preference: { naver_blog_open_enabled: enabled, updated_at: updatedAt } });
}
async function personalSystemInstruction(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    const user = await env.AUTH_DB.prepare(
        `SELECT u.id, u.role, u.plan_code FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    const type = new URL(request.url).searchParams.get('type') || 'keyword';
    if (!['keyword', 'story'].includes(type)) return response({ status: 'error', message: '지원하지 않는 지침 유형입니다.' }, 400);
    if (request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            `SELECT p.id AS profile_id,p.name,p.instruction,p.updated_at
             FROM user_ai_instruction_selections s JOIN user_ai_instruction_profiles p ON p.id=s.profile_id
             WHERE s.user_id=? AND s.instruction_type=? AND p.user_id=s.user_id`,
        ).bind(user.id, type).first();
        if (row) return response({ status: 'success', instruction: row.instruction || '', updated_at: row.updated_at || null, profile_id: row.profile_id, name: row.name });
        const savedProfile = await env.AUTH_DB.prepare(
            'SELECT 1 AS found FROM user_ai_instruction_profiles WHERE user_id=? AND instruction_type=? LIMIT 1',
        ).bind(user.id, type).first();
        if (savedProfile) return response({ status: 'success', instruction: '', updated_at: null, profile_id: null, name: null });
        const legacy = await env.AUTH_DB.prepare(
            'SELECT instruction,updated_at FROM user_ai_instructions WHERE user_id=? AND instruction_type=?',
        ).bind(user.id, type).first();
        return response({ status: 'success', instruction: legacy?.instruction || '', updated_at: legacy?.updated_at || null, profile_id: null, name: null });
    }
    const payload = await request.json().catch(() => ({}));
    const instruction = String(payload.instruction || '').trim();
    if (!instruction) {
        const selected = await env.AUTH_DB.prepare(
            'SELECT profile_id FROM user_ai_instruction_selections WHERE user_id=? AND instruction_type=?',
        ).bind(user.id, type).first();
        if (selected?.profile_id) {
            await env.AUTH_DB.prepare(
                'DELETE FROM user_ai_instruction_profiles WHERE id=? AND user_id=?',
            ).bind(selected.profile_id, user.id).run();
        }
        await env.AUTH_DB.prepare(
            'DELETE FROM user_ai_instructions WHERE user_id = ? AND instruction_type = ?',
        ).bind(user.id, type).run();
        return response({
            status: 'success',
            message: '개인 시스템 지침을 삭제했습니다.',
            instruction: '',
            updated_at: null,
            length: 0,
            deleted: true,
        });
    }
    if (instruction.length < 20) return response({ status: 'error', message: '개인 시스템 지침을 20자 이상 입력해 주세요.' }, 400);
    if (instruction.length > 20000) return response({ status: 'error', message: '개인 시스템 지침은 20,000자를 초과할 수 없습니다.' }, 400);
    const updatedAt = nowIso();
    const selected = await env.AUTH_DB.prepare(
        'SELECT profile_id FROM user_ai_instruction_selections WHERE user_id=? AND instruction_type=?',
    ).bind(user.id, type).first();
    if (selected?.profile_id) {
        await env.AUTH_DB.prepare(
            'UPDATE user_ai_instruction_profiles SET instruction=?,updated_at=? WHERE id=? AND user_id=?',
        ).bind(instruction, updatedAt, selected.profile_id, user.id).run();
    } else {
        const entitlements = await getPlanEntitlements(env, user.plan_code);
        const limit = Math.max(0, Number(entitlements['instruction.max_profiles'] || 0));
        const total = await env.AUTH_DB.prepare(
            'SELECT COUNT(*) AS count FROM user_ai_instruction_profiles WHERE user_id=?',
        ).bind(user.id).first();
        if (Number(total?.count || 0) >= limit) {
            return response({ status: 'error', code: 'INSTRUCTION_PROFILE_LIMIT_REACHED', message: '저장 한도(권한 등급)가 초과되었습니다. 기존 시스템 지침서는 유지되며 새 지침서만 추가할 수 없습니다.' }, 409);
        }
        const profileId = crypto.randomUUID();
        const name = type === 'story' ? '기본 메모·스토리 지침' : '기본 뉴스·키워드 지침';
        await env.AUTH_DB.prepare(
            `INSERT INTO user_ai_instruction_profiles(id,user_id,instruction_type,name,instruction,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?)`,
        ).bind(profileId, user.id, type, name, instruction, updatedAt, updatedAt).run();
        await env.AUTH_DB.prepare(
            'INSERT INTO user_ai_instruction_selections(user_id,instruction_type,profile_id,updated_at) VALUES(?,?,?,?)',
        ).bind(user.id, type, profileId, updatedAt).run();
    }
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ai_instructions (user_id, instruction_type, instruction, updated_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, instruction_type) DO UPDATE SET
         instruction=excluded.instruction, updated_at=excluded.updated_at`,
    ).bind(user.id, type, instruction, updatedAt).run();
    return response({ status: 'success', message: '개인 시스템 지침을 저장했습니다.', instruction, updated_at: updatedAt, length: instruction.length });
}

async function instructionProfileState(env, userId, type, limit) {
    const [profilesResult, countRow] = await Promise.all([
        env.AUTH_DB.prepare(
            `SELECT p.id,p.instruction_type,p.name,p.instruction,p.created_at,p.updated_at,
                    CASE WHEN s.profile_id=p.id THEN 1 ELSE 0 END AS is_active
             FROM user_ai_instruction_profiles p
             LEFT JOIN user_ai_instruction_selections s
               ON s.user_id=p.user_id AND s.instruction_type=p.instruction_type
             WHERE p.user_id=? AND p.instruction_type=?
             ORDER BY is_active DESC,p.updated_at DESC,p.name`,
        ).bind(userId, type).all(),
        env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM user_ai_instruction_profiles WHERE user_id=?').bind(userId).first(),
    ]);
    const profiles = profilesResult.results || [];
    const count = Number(countRow?.count || 0);
    return {
        profiles,
        active_profile_id: profiles.find(item => Number(item.is_active) === 1)?.id || null,
        count,
        limit,
        remaining: Math.max(0, limit - count),
    };
}

async function personalInstructionProfiles(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    const user = await env.AUTH_DB.prepare(
        `SELECT u.id,u.role,u.plan_code FROM auth_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    const payload = ['POST', 'PUT'].includes(request.method) ? await request.json().catch(() => ({})) : {};
    const url = new URL(request.url);
    const type = String(url.searchParams.get('type') || payload.type || 'keyword');
    if (!['keyword', 'story'].includes(type)) return response({ status: 'error', message: '지원하지 않는 지침 유형입니다.' }, 400);
    const entitlements = await getPlanEntitlements(env, user.plan_code);
    const limit = Math.max(0, Number(entitlements['instruction.max_profiles'] || 0));
    if (request.method === 'GET') return response({ status: 'success', ...await instructionProfileState(env, user.id, type, limit) });
    if (!sameOrigin(request)) return response({ status: 'error', message: '허용되지 않은 요청 출처입니다.' }, 403);
    const id = String(url.searchParams.get('id') || payload.id || '').trim();
    const current = nowIso();
    try {
        if (request.method === 'POST') {
            const instruction = String(payload.instruction || '').trim();
            const name = String(payload.name || (type === 'story' ? '새 메모·스토리 지침' : '새 뉴스·키워드 지침')).replace(/\s+/g, ' ').trim();
            if (name.length < 2 || name.length > 60) return response({ status: 'error', message: '지침 이름은 2~60자로 입력해 주세요.' }, 400);
            if (instruction.length < 20) return response({ status: 'error', message: '개인 시스템 지침을 20자 이상 입력해 주세요.' }, 400);
            if (instruction.length > 20000) return response({ status: 'error', message: '개인 시스템 지침은 20,000자를 초과할 수 없습니다.' }, 400);
            const state = await instructionProfileState(env, user.id, type, limit);
            if (state.count >= limit) return response({ status: 'error', code: 'INSTRUCTION_PROFILE_LIMIT_REACHED', message: '저장 한도(권한 등급)가 초과되었습니다. 기존 시스템 지침서는 유지되며 새 지침서만 추가할 수 없습니다.', count: state.count, limit }, 409);
            const profileId = crypto.randomUUID();
            await env.AUTH_DB.prepare(
                `INSERT INTO user_ai_instruction_profiles(id,user_id,instruction_type,name,instruction,created_at,updated_at)
                 VALUES(?,?,?,?,?,?,?)`,
            ).bind(profileId, user.id, type, name, instruction, current, current).run();
            if (payload.activate !== false) {
                await env.AUTH_DB.prepare(
                    `INSERT INTO user_ai_instruction_selections(user_id,instruction_type,profile_id,updated_at)
                     VALUES(?,?,?,?) ON CONFLICT(user_id,instruction_type) DO UPDATE SET profile_id=excluded.profile_id,updated_at=excluded.updated_at`,
                ).bind(user.id, type, profileId, current).run();
            }
            return response({ status: 'success', message: '새 개인 시스템 지침을 저장하고 적용했습니다.', profile_id: profileId, ...await instructionProfileState(env, user.id, type, limit) });
        }
        if (!id) return response({ status: 'error', message: request.method === 'DELETE' ? '삭제할 지침을 선택해 주세요.' : '수정할 지침을 선택해 주세요.' }, 400);
        const owned = await env.AUTH_DB.prepare(
            'SELECT id FROM user_ai_instruction_profiles WHERE id=? AND user_id=? AND instruction_type=?',
        ).bind(id, user.id, type).first();
        if (!owned) return response({ status: 'error', message: '지침을 찾을 수 없습니다.' }, 404);
        if (request.method === 'DELETE') {
            await env.AUTH_DB.prepare('DELETE FROM user_ai_instruction_profiles WHERE id=? AND user_id=?').bind(id, user.id).run();
            const replacement = await env.AUTH_DB.prepare(
                'SELECT id FROM user_ai_instruction_profiles WHERE user_id=? AND instruction_type=? ORDER BY updated_at DESC LIMIT 1',
            ).bind(user.id, type).first();
            if (replacement) {
                await env.AUTH_DB.prepare(
                    `INSERT INTO user_ai_instruction_selections(user_id,instruction_type,profile_id,updated_at)
                     VALUES(?,?,?,?) ON CONFLICT(user_id,instruction_type) DO UPDATE SET profile_id=excluded.profile_id,updated_at=excluded.updated_at`,
                ).bind(user.id, type, replacement.id, current).run();
            }
            return response({ status: 'success', message: '개인 시스템 지침을 삭제했습니다.', profile_id: id, ...await instructionProfileState(env, user.id, type, limit) });
        }
        if (payload.action === 'deactivate') {
            await env.AUTH_DB.batch([
                env.AUTH_DB.prepare('DELETE FROM user_ai_instruction_selections WHERE user_id=? AND instruction_type=?').bind(user.id, type),
                env.AUTH_DB.prepare(`INSERT INTO user_ai_instruction_usage(user_id,instruction_type,enabled,updated_at)
                    VALUES(?,?,0,?) ON CONFLICT(user_id,instruction_type) DO UPDATE SET enabled=0,updated_at=excluded.updated_at`).bind(user.id, type, current),
            ]);
            return response({ status: 'success', message: '개인 시스템 지침 사용을 해제했습니다.', profile_id: id, ...await instructionProfileState(env, user.id, type, limit) });
        }
        if (payload.action !== 'activate') {
            const instruction = String(payload.instruction || '').trim();
            const name = String(payload.name || '').replace(/\s+/g, ' ').trim();
            if (name.length < 2 || name.length > 60) return response({ status: 'error', message: '지침 이름은 2~60자로 입력해 주세요.' }, 400);
            if (instruction.length < 20) return response({ status: 'error', message: '개인 시스템 지침을 20자 이상 입력해 주세요.' }, 400);
            if (instruction.length > 20000) return response({ status: 'error', message: '개인 시스템 지침은 20,000자를 초과할 수 없습니다.' }, 400);
            await env.AUTH_DB.prepare(
                'UPDATE user_ai_instruction_profiles SET name=?,instruction=?,updated_at=? WHERE id=? AND user_id=?',
            ).bind(name, instruction, current, id, user.id).run();
        }
        if (payload.action === 'activate' || payload.activate !== false) {
            await env.AUTH_DB.prepare(
                `INSERT INTO user_ai_instruction_selections(user_id,instruction_type,profile_id,updated_at)
                 VALUES(?,?,?,?) ON CONFLICT(user_id,instruction_type) DO UPDATE SET profile_id=excluded.profile_id,updated_at=excluded.updated_at`,
            ).bind(user.id, type, id, current).run();
            if (payload.action === 'activate') {
                await env.AUTH_DB.prepare(`INSERT INTO user_ai_instruction_usage(user_id,instruction_type,enabled,updated_at)
                    VALUES(?,?,1,?) ON CONFLICT(user_id,instruction_type) DO UPDATE SET enabled=1,updated_at=excluded.updated_at`).bind(user.id, type, current).run();
            }
        }
        return response({ status: 'success', message: '개인 시스템 지침을 저장하고 적용했습니다.', profile_id: id, ...await instructionProfileState(env, user.id, type, limit) });
    } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || ''))) return response({ status: 'error', message: '같은 유형에 동일한 지침 이름이 이미 있습니다.' }, 409);
        throw error;
    }
}

async function uiPreferences(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    const user = await env.AUTH_DB.prepare(
        `SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (request.method === 'GET') {
        const preference = await env.AUTH_DB.prepare(
            'SELECT font_family, font_scale, font_weight, theme_mode, updated_at FROM user_ui_preferences WHERE user_id = ?',
        ).bind(user.id).first();
        return response({ status: 'success', preference: preference || null });
    }
    const payload = await request.json().catch(() => ({}));
    const fontFamily = String(payload.font_family || 'paperlogy');
    const fontScale = String(payload.font_scale || 'normal');
    const fontWeight = String(payload.font_weight || '400');
    const themeMode = String(payload.theme_mode || 'system');
    if (!['paperlogy', 'pretendard', 'suit', 'noto', 'system', 'serif'].includes(fontFamily) || !['compact', 'normal', 'large'].includes(fontScale) || !['300', '400', '500'].includes(fontWeight) || !['system', 'light', 'dark'].includes(themeMode)) {
        return response({ status: 'error', message: '지원하지 않는 화면 글꼴 설정입니다.' }, 400);
    }
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ui_preferences (user_id, font_family, font_scale, font_weight, theme_mode, updated_at)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
         font_family=excluded.font_family, font_scale=excluded.font_scale,
         font_weight=excluded.font_weight, theme_mode=excluded.theme_mode, updated_at=excluded.updated_at`,
    ).bind(user.id, fontFamily, fontScale, fontWeight, themeMode, updatedAt).run();
    return response({ status: 'success', message: '화면 테마와 글꼴 설정을 저장했습니다.', updated_at: updatedAt });
}

function jsonArray(value) {
    try { return Array.isArray(JSON.parse(value || '[]')) ? JSON.parse(value || '[]') : []; }
    catch (_) { return []; }
}

async function accountDrafts(request, env, draftId = '') {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.write')) return response({ status: 'error', message: '현재 회원 등급에는 원고 저장 권한이 없습니다.' }, 403);
    const entitlements = await getPlanEntitlements(env, user.plan_code);
    const limit = Math.max(0, Number(entitlements['draft.max_count'] ?? 0));
    if (draftId) {
        const row = await env.AUTH_DB.prepare('SELECT * FROM user_drafts WHERE id = ? AND user_id = ?').bind(draftId, user.id).first();
        if (!row) return response({ status: 'error', message: '원고를 찾을 수 없습니다.' }, 404);
        if (request.method === 'GET') {
            return response({ status: 'success', draft: { ...row, status: 'saved', tags: jsonArray(row.tags_json), source_urls: jsonArray(row.source_urls_json), tags_json: undefined, source_urls_json: undefined } });
        }
        if (request.method === 'DELETE') {
            await env.AUTH_DB.prepare('DELETE FROM user_drafts WHERE id = ? AND user_id = ?').bind(draftId, user.id).run();
            const countRow = await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?').bind(user.id).first();
            return response({ status: 'success', message: '원고를 삭제했습니다.', count: Number(countRow?.count || 0), limit });
        }
        return response({ status: 'error', message: '지원하지 않는 요청입니다.' }, 405);
    }
    if (request.method === 'GET') {
        const rows = await env.AUTH_DB.prepare(
            'SELECT id, title, category, created_at, updated_at, length(body_markdown) AS body_length FROM user_drafts WHERE user_id = ? ORDER BY updated_at DESC',
        ).bind(user.id).all();
        const countRow = await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?').bind(user.id).first();
        return response({ status: 'success', drafts: (rows.results || []).map(row => ({ ...row, status: 'saved' })), count: Number(countRow?.count || 0), limit });
    }
    if (request.method !== 'POST') return response({ status: 'error', message: '지원하지 않는 요청입니다.' }, 405);
    const payload = await request.json().catch(() => ({}));
    const title = String(payload.title || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const body = String(payload.body_markdown || '').trim();
    const category = String(payload.category || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const tags = (Array.isArray(payload.tags) ? payload.tags : []).map(value => String(value).trim().slice(0, 100)).filter(Boolean).slice(0, 30);
    const sourceUrls = (Array.isArray(payload.source_urls) ? payload.source_urls : []).map(value => String(value).trim().slice(0, 2000)).filter(Boolean).slice(0, 30);
    if (!title || body.length < 30) return response({ status: 'error', message: '제목과 30자 이상의 본문이 필요합니다.' }, 400);
    const existing = await env.AUTH_DB.prepare('SELECT id, created_at FROM user_drafts WHERE user_id = ? AND title = ? ORDER BY updated_at DESC LIMIT 1').bind(user.id, title).first();
    const current = nowIso();
    let id = existing?.id || crypto.randomUUID();
    let createdAt = existing?.created_at || current;
    const countRow = await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?').bind(user.id).first();
    let count = Number(countRow?.count || 0);
    if (!existing && (limit <= 0 || count >= limit)) {
        const oldest = await env.AUTH_DB.prepare('SELECT title FROM user_drafts WHERE user_id = ? ORDER BY updated_at ASC LIMIT 1').bind(user.id).first();
        return response({ status: 'error', code: 'DRAFT_LIMIT_REACHED', message: '저장 한도(권한 등급)가 초과되었습니다. 기존 원고는 유지되며 새 원고만 추가할 수 없습니다.', count, limit, replace_count: 0, oldest_titles: oldest ? [oldest.title] : [] }, 409);
    }
    await env.AUTH_DB.prepare(
        `INSERT INTO user_drafts (id, user_id, title, body_markdown, tags_json, category, source_urls_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
         body_markdown=excluded.body_markdown, tags_json=excluded.tags_json, category=excluded.category,
         source_urls_json=excluded.source_urls_json, updated_at=excluded.updated_at`,
    ).bind(id, user.id, title, body, JSON.stringify(tags), category, JSON.stringify(sourceUrls), createdAt, current).run();
    const finalCount = await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM user_drafts WHERE user_id = ?').bind(user.id).first();
    return response({ status: 'success', message: '원고를 계정 DB에 저장했습니다.', draft: { id, title }, updated_existing: Boolean(existing), count: Number(finalCount?.count || 0), limit });
}

function sameOrigin(request) {
    const origin = request.headers.get('Origin');
    return !origin || origin === new URL(request.url).origin;
}

export async function handleAdminRequest(request, env, pathname) {
    let admin;
    try { admin = await getAuthenticatedUser(request, env); }
    catch (error) { return response({ status: 'error', message: error.message }, 503); }
    if (!admin || admin.role !== 'admin') return response({ status: 'error', message: '관리자 권한이 필요합니다.' }, 403);
    const requiredSettingsFeature = pathname === '/api/admin/service-plans'
        ? 'admin.service_plans'
        : (pathname === '/api/admin/billing-settings'
            ? 'admin.billing_settings'
            : (['/api/admin/ai-routing', '/api/admin/news-search', '/api/admin/ai-models'].includes(pathname)
                ? 'admin.system_settings'
                : (pathname === '/api/admin/permissions' ? 'admin.permissions' : '')));
    if (requiredSettingsFeature && !await hasFeature(env, admin, requiredSettingsFeature)) {
        return response({ status: 'error', message: '해당 설정은 관리자 전용 기능입니다.' }, 403);
    }

    if (pathname === '/api/admin/summary' && request.method === 'GET') {
        const summary = await env.AUTH_DB.prepare(
            `SELECT COUNT(*) AS total, SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins,
                    SUM(CASE WHEN status!='active' THEN 1 ELSE 0 END) AS inactive FROM users`,
        ).first();
        return response({ status: 'success', summary: summary || {} });
    }

    if (pathname === '/api/admin/users' && request.method === 'GET') {
        const url = new URL(request.url);
        const query = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const where = query ? 'WHERE lower(u.email) LIKE ? OR lower(u.nickname) LIKE ?' : '';
        const args = query ? [`%${query}%`, `%${query}%`] : [];
        const countStmt = env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM users u ${where}`).bind(...args);
        const listStmt = env.AUTH_DB.prepare(
            `SELECT u.id, u.email, u.nickname, u.role, u.plan_code, u.status, u.created_at, u.last_login_at,
                    COALESCE(c.balance, 0) AS credit_balance
             FROM users u LEFT JOIN user_writing_credits c ON c.user_id=u.id
             ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        ).bind(...args, limit, offset);
        const summaryStmt = env.AUTH_DB.prepare(
            `SELECT COUNT(*) AS total, SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins,
                    SUM(CASE WHEN status!='active' THEN 1 ELSE 0 END) AS inactive FROM users`,
        );
        const [count, list, summary] = await env.AUTH_DB.batch([countStmt, listStmt, summaryStmt]);
        return response({ status: 'success', users: list.results || [], total: Number(count.results?.[0]?.count || 0), summary: summary.results?.[0] || {} });
    }

    if (!sameOrigin(request)) return response({ status: 'error', message: '허용되지 않은 요청 출처입니다.' }, 403);
    const relayUrl = String(env.KOREA_AI_PROXY_URL || '').trim();
    const relayToken = String(env.KOREA_AI_PROXY_KEY || '').trim();
    const relaySecure = /^https:\/\//i.test(relayUrl);
    const insecureAllowed = String(env.KOREA_AI_PROXY_ALLOW_INSECURE || '').toLowerCase() === 'true';
    const relayConfigured = (relaySecure || (insecureAllowed && /^http:\/\//i.test(relayUrl))) && relayToken.length >= 32;
    if (pathname === '/api/admin/billing-settings' && request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='billing_features'",
        ).first();
        return response({ status: 'success', settings: normalizeBillingSettings(row?.setting_value), updated_at: row?.updated_at || null });
    }
    if (pathname === '/api/admin/billing-settings' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const settings = normalizeBillingSettings(payload);
        if (settings.donation_enabled && !settings.donation_url) {
            return response({ status: 'error', message: '커피 후원받기를 사용하려면 올바른 외부 URL을 등록해 주세요.' }, 400);
        }
        const serialized = JSON.stringify(settings);
        const current = nowIso();
        const before = await env.AUTH_DB.prepare(
            "SELECT setting_value FROM service_settings WHERE setting_key='billing_features'",
        ).first();
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(
                `INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
                 VALUES('billing_features',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
                 setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
            ).bind(serialized, current, admin.id),
            env.AUTH_DB.prepare(
                "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'billing.settings.update',?,?,?)",
            ).bind(crypto.randomUUID(), admin.id, before?.setting_value || JSON.stringify(DEFAULT_BILLING_SETTINGS), serialized, current),
        ]);
        return response({ status: 'success', message: '결제 설정을 저장했습니다.', settings, updated_at: current });
    }
    if (pathname === '/api/admin/ai-routing' && request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='ai_route'",
        ).first();
        return response({
            status: 'success',
            mode: row?.setting_value === 'korea_relay' ? 'korea_relay' : 'direct',
            relay_configured: relayConfigured,
            relay_secure: relaySecure,
            updated_at: row?.updated_at || null,
        });
    }
    if (pathname === '/api/admin/ai-routing' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const mode = String(payload.mode || '');
        if (!['direct', 'korea_relay'].includes(mode)) {
            return response({ status: 'error', message: '지원하지 않는 AI API 연결 방식입니다.' }, 400);
        }
        if (mode === 'korea_relay' && !relayConfigured) {
            return response({ status: 'error', message: '한국 서버 프록시 URL·인증키 설정을 확인해 주세요. HTTP는 임시 허용 설정 없이는 사용할 수 없습니다.' }, 409);
        }
        const current = nowIso();
        const before = await env.AUTH_DB.prepare(
            "SELECT setting_value FROM service_settings WHERE setting_key='ai_route'",
        ).first();
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(
                `INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
                 VALUES('ai_route',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
                 setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
            ).bind(mode, current, admin.id),
            env.AUTH_DB.prepare(
                "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'ai.routing.update',?,?,?)",
            ).bind(crypto.randomUUID(), admin.id, before?.setting_value || 'direct', mode, current),
        ]);
        return response({ status: 'success', message: 'AI API 연결 방식을 저장했습니다.', mode, relay_configured: relayConfigured, relay_secure: relaySecure, updated_at: current });
    }
    const newsSearchModes = new Set(['naver_only', 'google_only', 'naver_then_google', 'google_then_naver']);
    if (pathname === '/api/admin/news-search' && request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='news_search_mode'",
        ).first();
        return response({
            status: 'success',
            mode: newsSearchModes.has(row?.setting_value) ? row.setting_value : 'google_then_naver',
            updated_at: row?.updated_at || null,
        });
    }
    if (pathname === '/api/admin/news-search' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const mode = String(payload.mode || '');
        if (!newsSearchModes.has(mode)) {
            return response({ status: 'error', message: '지원하지 않는 뉴스 검색 방식입니다.' }, 400);
        }
        const current = nowIso();
        const before = await env.AUTH_DB.prepare(
            "SELECT setting_value FROM service_settings WHERE setting_key='news_search_mode'",
        ).first();
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(
                `INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
                 VALUES('news_search_mode',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
                 setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
            ).bind(mode, current, admin.id),
            env.AUTH_DB.prepare(
                "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'news.search.update',?,?,?)",
            ).bind(crypto.randomUUID(), admin.id, before?.setting_value || 'google_then_naver', mode, current),
        ]);
        return response({ status: 'success', message: '뉴스 검색 방식을 저장했습니다.', mode, updated_at: current });
    }
    if (pathname === '/api/admin/ai-models' && request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            "SELECT setting_value, updated_at FROM service_settings WHERE setting_key='ai_model_catalog'",
        ).first();
        return response({ status: 'success', models: normalizeAiModelCatalog(row?.setting_value, true), updated_at: row?.updated_at || null });
    }
    if (pathname === '/api/admin/ai-models' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const models = normalizeAiModelCatalog(payload.models, true);
        const serialized = JSON.stringify(models.map(item => ({ value: item.value, enabled: item.enabled, badge: item.badge })));
        const current = nowIso();
        const before = await env.AUTH_DB.prepare(
            "SELECT setting_value FROM service_settings WHERE setting_key='ai_model_catalog'",
        ).first();
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(
                `INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by)
                 VALUES('ai_model_catalog',?,?,?) ON CONFLICT(setting_key) DO UPDATE SET
                 setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
            ).bind(serialized, current, admin.id),
            env.AUTH_DB.prepare(
                "INSERT INTO admin_audit_logs(id,admin_user_id,action,before_value,after_value,created_at) VALUES(?,?,'ai.models.update',?,?,?)",
            ).bind(crypto.randomUUID(), admin.id, before?.setting_value || '', serialized, current),
        ]);
        return response({ status: 'success', message: 'AI 모델 노출 설정을 저장했습니다.', models, updated_at: current });
    }
    const detailMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/detail$/);
    if (detailMatch && request.method === 'GET') {
        const userId = decodeURIComponent(detailMatch[1]);
        const current = nowIso();
        const monthStart = current.slice(0, 7) + '-01T00:00:00.000Z';
        const [user, credit, activity, recentJobs, auditLogs] = await Promise.all([
            env.AUTH_DB.prepare(`SELECT id,email,nickname,role,plan_code,status,email_verified_at,created_at,updated_at,last_login_at
                FROM users WHERE id=?`).bind(userId).first(),
            env.AUTH_DB.prepare('SELECT balance,earned_total,used_total,updated_at FROM user_writing_credits WHERE user_id=?').bind(userId).first(),
            env.AUTH_DB.prepare(`SELECT
                (SELECT COUNT(*) FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?) AS active_sessions,
                (SELECT COUNT(*) FROM user_drafts WHERE user_id=?) AS draft_count,
                (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=?) AS writing_jobs,
                (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND status='completed') AS completed_jobs,
                (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND status='failed') AS failed_jobs,
                (SELECT COUNT(*) FROM ai_writing_usage_logs WHERE user_id=? AND created_at>=?) AS current_month_jobs,
                (SELECT COALESCE(SUM(usage_units),0) FROM ai_writing_usage_logs WHERE user_id=?) AS usage_units,
                (SELECT COALESCE(SUM(usage_units),0) FROM ai_writing_usage_logs WHERE user_id=? AND created_at>=?) AS current_month_units,
                (SELECT COUNT(*) FROM referral_claims WHERE referred_user_id=? OR referrer_user_id=?) AS referral_count`)
                .bind(userId,current,userId,userId,userId,userId,userId,monthStart,userId,userId,monthStart,userId,userId).first(),
            env.AUTH_DB.prepare('SELECT id,operation,writing_mode,model,status,execution_type,source_kind,input_chars,output_chars,duration_ms,usage_units,credit_charged,credit_refunded,error_code,created_at,completed_at FROM ai_writing_usage_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(userId).all(),
            env.AUTH_DB.prepare(`SELECT l.action,l.before_value,l.after_value,l.reason,l.created_at,
                    COALESCE(a.nickname,a.email,'관리자') AS admin_name
                FROM admin_audit_logs l LEFT JOIN users a ON a.id=l.admin_user_id
                WHERE l.target_user_id=? ORDER BY l.created_at DESC LIMIT 20`).bind(userId).all(),
        ]);
        if (!user) return response({ status: 'error', message: '회원을 찾을 수 없습니다.' }, 404);
        return response({
            status: 'success', user,
            credits: credit || { balance: 0, earned_total: 0, used_total: 0, updated_at: null },
            activity: activity || {},
            recent_jobs: recentJobs.results || [],
            audit_logs: auditLogs.results || [],
        });
    }
    const updateMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (updateMatch && request.method === 'PATCH') {
        const userId = decodeURIComponent(updateMatch[1]);
        const payload = await request.json().catch(() => ({}));
        const role = String(payload.role || '');
        const planCode = String(payload.plan_code || 'free');
        const status = String(payload.status || '');
        if (!['member', 'premium', 'operator', 'admin'].includes(role) || !SERVICE_PLAN_CODES.includes(planCode) || !['active', 'suspended'].includes(status)) {
            return response({ status: 'error', message: '지원하지 않는 역할, 서비스 등급 또는 상태입니다.' }, 400);
        }
        if (userId === admin.id && (role !== 'admin' || status !== 'active')) {
            return response({ status: 'error', message: '현재 로그인한 관리자 자신의 권한은 해제할 수 없습니다.' }, 409);
        }
        const before = await env.AUTH_DB.prepare('SELECT role, plan_code, status FROM users WHERE id=?').bind(userId).first();
        if (!before) return response({ status: 'error', message: '회원을 찾을 수 없습니다.' }, 404);
        const current = nowIso();
        const statements = [
            env.AUTH_DB.prepare('UPDATE users SET role=?, plan_code=?, status=?, updated_at=? WHERE id=?').bind(role, planCode, status, current, userId),
            env.AUTH_DB.prepare("INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, before_value, after_value, created_at) VALUES (?, ?, 'user.update', ?, ?, ?, ?)")
                .bind(crypto.randomUUID(), admin.id, userId, `${before.role}|${before.plan_code}|${before.status}`, `${role}|${planCode}|${status}`, current),
        ];
        if (status !== 'active') statements.push(env.AUTH_DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(current, userId));
        await env.AUTH_DB.batch(statements);
        return response({ status: 'success', message: '회원 권한을 저장했습니다.' });
    }

    const creditMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits$/);
    if (creditMatch && (request.method === 'POST' || request.method === 'PATCH')) {
        const userId = decodeURIComponent(creditMatch[1]);
        const payload = await request.json().catch(() => ({}));
        if (!await env.AUTH_DB.prepare('SELECT 1 FROM users WHERE id=?').bind(userId).first()) {
            return response({ status: 'error', message: '회원을 찾을 수 없습니다.' }, 404);
        }
        const before = await env.AUTH_DB.prepare('SELECT balance,earned_total,used_total FROM user_writing_credits WHERE user_id=?').bind(userId).first();
        const beforeBalance = Number(before?.balance || 0);
        const current = nowIso();
        if (request.method === 'PATCH') {
            const balance = Number(payload.balance);
            if (!Number.isInteger(balance) || balance < 0 || balance > 1000000) {
                return response({ status: 'error', message: '글쓰기 가능 건수는 0~1,000,000건으로 설정해 주세요.' }, 400);
            }
            const increase = Math.max(0, balance - beforeBalance);
            await env.AUTH_DB.batch([
                env.AUTH_DB.prepare(`INSERT INTO user_writing_credits (user_id,balance,earned_total,used_total,updated_at)
                    VALUES (?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance,
                    earned_total=earned_total+?,updated_at=excluded.updated_at`).bind(userId,balance,balance,current,increase),
                env.AUTH_DB.prepare(`INSERT INTO admin_audit_logs
                    (id,admin_user_id,action,target_user_id,before_value,after_value,reason,created_at)
                    VALUES (?,?,'credits.set',?,?,?,?,?)`)
                    .bind(crypto.randomUUID(),admin.id,userId,String(beforeBalance),String(balance),String(payload.reason || '관리자 페이지 잔여 건수 설정').slice(0,200),current),
            ]);
            return response({ status: 'success', message: `글쓰기 가능 건수를 ${balance.toLocaleString('ko-KR')}건으로 저장했습니다.`, balance });
        }
        const amount = Number.parseInt(payload.amount, 10);
        if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
            return response({ status: 'error', message: '쿠폰은 1~1,000건까지 지급할 수 있습니다.' }, 400);
        }
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(`INSERT INTO user_writing_credits (user_id, balance, earned_total, used_total, updated_at)
                VALUES (?, ?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance,
                earned_total=earned_total+excluded.earned_total, updated_at=excluded.updated_at`).bind(userId, amount, amount, current),
            env.AUTH_DB.prepare("INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, after_value, reason, created_at) VALUES (?, ?, 'credits.grant', ?, ?, ?, ?)")
                .bind(crypto.randomUUID(), admin.id, userId, String(amount), String(payload.reason || '관리자 지급').slice(0, 200), current),
        ]);
        const credit = await env.AUTH_DB.prepare('SELECT balance FROM user_writing_credits WHERE user_id=?').bind(userId).first();
        return response({ status: 'success', message: `쿠폰 ${amount}건을 지급했습니다.`, balance: Number(credit?.balance || 0) });
    }
    if (pathname === '/api/admin/service-plans' && request.method === 'GET') {
        const [plansResult, entitlementResult] = await env.AUTH_DB.batch([
            env.AUTH_DB.prepare('SELECT plan_code,display_name,description,sort_order,active,updated_at FROM subscription_plans ORDER BY sort_order'),
            env.AUTH_DB.prepare('SELECT plan_code,entitlement_key,value_type,value_text,updated_at FROM plan_entitlements ORDER BY plan_code,entitlement_key'),
        ]);
        const entitlements = {};
        for (const planCode of SERVICE_PLAN_CODES) entitlements[planCode] = {};
        for (const row of entitlementResult.results || []) {
            entitlements[row.plan_code] ||= {};
            entitlements[row.plan_code][row.entitlement_key] = parsePlanEntitlementValue(row.value_type, row.value_text);
        }
        return response({
            status: 'success',
            plans: plansResult.results || [],
            definitions: SERVICE_PLAN_DEFINITIONS,
            entitlements,
        });
    }
    if (pathname === '/api/admin/service-plans' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const submitted = payload.entitlements;
        if (!submitted || typeof submitted !== 'object') {
            return response({ status: 'error', message: '서비스 등급 설정값이 필요합니다.' }, 400);
        }
        const current = nowIso();
        const statements = [];
        const normalized = {};
        try {
            for (const planCode of SERVICE_PLAN_CODES) {
                if (!submitted[planCode] || typeof submitted[planCode] !== 'object') throw new Error(planCode + ' 등급 설정이 누락되었습니다.');
                normalized[planCode] = {};
                for (const definition of SERVICE_PLAN_DEFINITIONS) {
                    const valueText = normalizePlanEntitlementInput(definition, submitted[planCode][definition.key]);
                    normalized[planCode][definition.key] = parsePlanEntitlementValue(definition.type, valueText);
                    statements.push(env.AUTH_DB.prepare(
                        'INSERT INTO plan_entitlements(plan_code,entitlement_key,value_type,value_text,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(plan_code,entitlement_key) DO UPDATE SET value_type=excluded.value_type,value_text=excluded.value_text,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
                    ).bind(planCode, definition.key, definition.type, valueText, current, admin.id));
                }
            }
        } catch (error) {
            return response({ status: 'error', message: error.message }, 400);
        }
        statements.push(env.AUTH_DB.prepare(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,after_value,created_at) VALUES(?,?,'service_plans.update',?,?)",
        ).bind(crypto.randomUUID(), admin.id, JSON.stringify(normalized).slice(0, 10000), current));
        await env.AUTH_DB.batch(statements);
        return response({ status: 'success', message: '서비스 등급별 기능 설정을 저장했습니다.', entitlements: normalized, updated_at: current });
    }
    if (pathname === '/api/admin/permissions' && request.method === 'GET') {
        const rows = await env.AUTH_DB.prepare(
            'SELECT role, feature_key, enabled, updated_at FROM role_feature_permissions ORDER BY role, feature_key',
        ).all();
        const permissions = {};
        for (const row of rows.results || []) {
            permissions[row.role] ||= {};
            permissions[row.role][row.feature_key] = Boolean(row.enabled);
        }
        return response({ status: 'success', permissions });
    }
    if (pathname === '/api/admin/permissions' && request.method === 'PATCH') {
        const payload = await request.json().catch(() => ({}));
        const role = String(payload.role || '');
        const permissions = payload.permissions || {};
        const roles = new Set(['member', 'premium', 'operator', 'admin']);
        const features = new Set(['dashboard.extended', 'trend.naver', 'studio.access', 'ai.write', 'ai.personalize', 'billing.access', 'admin.members', 'admin.permissions', 'admin.service_plans', 'admin.billing_settings', 'admin.system_settings']);
        const adminOnlyFeatures = new Set(['admin.permissions', 'admin.service_plans', 'admin.billing_settings', 'admin.system_settings']);
        if (!roles.has(role) || !permissions || typeof permissions !== 'object' || Object.keys(permissions).some((key) => !features.has(key))) {
            return response({ status: 'error', message: '지원하지 않는 역할 또는 기능 권한입니다.' }, 400);
        }
        if (role === 'admin') for (const featureKey of features) permissions[featureKey] = true;
        if (role !== 'admin') for (const featureKey of adminOnlyFeatures) permissions[featureKey] = false;
        const current = nowIso();
        const statements = Object.entries(permissions).map(([key, enabled]) => env.AUTH_DB.prepare(
            `INSERT INTO role_feature_permissions(role, feature_key, enabled, updated_at, updated_by)
             VALUES(?,?,?,?,?) ON CONFLICT(role, feature_key) DO UPDATE SET enabled=excluded.enabled,
             updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        ).bind(role, key, enabled ? 1 : 0, current, admin.id));
        statements.push(env.AUTH_DB.prepare(
            "INSERT INTO admin_audit_logs(id,admin_user_id,action,after_value,created_at) VALUES(?,?,'permissions.update',?,?)",
        ).bind(crypto.randomUUID(), admin.id, `${role}:${JSON.stringify(permissions)}`, current));
        await env.AUTH_DB.batch(statements);
        return response({ status: 'success', message: '기능별 권한을 저장했습니다.', role, permissions });
    }
    return response({ status: 'error', message: '지원하지 않는 관리자 API입니다.' }, 404);
}

async function referralStatus(request, env) {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    const [credit, claim] = await Promise.all([
        env.AUTH_DB.prepare('SELECT balance, earned_total, used_total FROM user_writing_credits WHERE user_id = ?').bind(user.id).first(),
        env.AUTH_DB.prepare('SELECT reward_count, created_at FROM referral_claims WHERE referred_user_id = ?').bind(user.id).first(),
    ]);
    const unlimited = ['premium', 'operator', 'admin'].includes(user.role);
    return response({
        status: 'success', balance: unlimited ? null : Number(credit?.balance || 0),
        earned_total: Number(credit?.earned_total || 0), used_total: Number(credit?.used_total || 0),
        unlimited, display_limit: 10,
        claimed: Boolean(claim), reward_count: Number(claim?.reward_count || 10),
        claimed_at: claim?.created_at || null,
    });
}

async function claimReferral(request, env) {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    const payload = await request.json().catch(() => ({}));
    let referrerEmail;
    try { referrerEmail = normalizeEmail(payload.referrer_email); }
    catch (error) { return response({ status: 'error', message: error.message }, 400); }
    if (referrerEmail === String(user.email).toLowerCase()) {
        return response({ status: 'error', message: '본인 이메일은 추천인으로 등록할 수 없습니다.' }, 400);
    }
    const existing = await env.AUTH_DB.prepare(
        'SELECT 1 FROM referral_claims WHERE referred_user_id = ?',
    ).bind(user.id).first();
    if (existing) return response({ status: 'error', message: '추천인 쿠폰은 계정당 한 번만 발급됩니다.' }, 409);
    const referrer = await env.AUTH_DB.prepare(
        "SELECT id FROM users WHERE email = ? AND status = 'active' AND email_verified_at IS NOT NULL",
    ).bind(referrerEmail).first();
    if (!referrer) return response({ status: 'error', message: '가입과 이메일 인증을 완료한 친구를 찾을 수 없습니다.' }, 404);
    const current = nowIso();
    try {
        await env.AUTH_DB.batch([
            env.AUTH_DB.prepare(
                'INSERT INTO referral_claims (id, referred_user_id, referrer_user_id, reward_count, created_at) VALUES (?, ?, ?, 10, ?)',
            ).bind(crypto.randomUUID(), user.id, referrer.id, current),
            env.AUTH_DB.prepare(
                `INSERT INTO user_writing_credits (user_id, balance, earned_total, used_total, updated_at)
                 VALUES (?, 10, 10, 0, ?)
                 ON CONFLICT(user_id) DO UPDATE SET balance=balance+10,
                 earned_total=earned_total+10, updated_at=excluded.updated_at`,
            ).bind(user.id, current),
        ]);
    } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || ''))) {
            return response({ status: 'error', message: '추천인 쿠폰은 계정당 한 번만 발급됩니다.' }, 409);
        }
        throw error;
    }
    const credit = await env.AUTH_DB.prepare('SELECT balance FROM user_writing_credits WHERE user_id = ?').bind(user.id).first();
    return response({
        status: 'success', message: '무료 AI 글쓰기 쿠폰 10건을 발급했습니다.',
        reward_count: 10, balance: Number(credit?.balance || 10), claimed: true,
    });
}

export async function handleAuthRequest(request, env, pathname) {
    if (pathname === '/api/auth/plans' && request.method === 'GET') return publicServicePlans(env);
    if (pathname === '/api/auth/request-otp' && request.method === 'POST') return requestOtp(request, env);
    if (pathname === '/api/auth/verify-otp' && request.method === 'POST') return verifyOtp(request, env);
    if (pathname === '/api/auth/session' && request.method === 'GET') return sessionStatus(request, env);
    if (pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
    if (pathname === '/api/auth/preferences/ai-persona' && ['GET', 'PUT'].includes(request.method)) return aiPersonaPreferences(request, env);
    if (pathname === '/api/auth/preferences/persona-profiles' && ['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return personaProfiles(request, env);
    if (pathname === '/api/auth/preferences/ai-instruction-sections' && ['GET', 'PUT'].includes(request.method)) return personalAiInstructionSections(request, env);
    if (pathname === '/api/auth/preferences/integrations' && ['GET', 'PUT'].includes(request.method)) return integrationPreferences(request, env);
    if (pathname === '/api/auth/preferences/instruction-profiles' && ['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return personalInstructionProfiles(request, env);
    if (pathname === '/api/auth/preferences/system-instruction' && ['GET', 'PUT'].includes(request.method)) return personalSystemInstruction(request, env);
    if (pathname === '/api/auth/preferences/ui' && ['GET', 'PUT'].includes(request.method)) return uiPreferences(request, env);
    if (pathname === '/api/auth/referrals/status' && request.method === 'GET') return referralStatus(request, env);
    if (pathname === '/api/auth/referrals/claim' && request.method === 'POST') return claimReferral(request, env);
    if (pathname === '/api/auth/drafts' && ['GET', 'POST'].includes(request.method)) return accountDrafts(request, env);
    const draftMatch = pathname.match(/^\/api\/auth\/drafts\/([^/]+)$/);
    if (draftMatch && ['GET', 'DELETE'].includes(request.method)) return accountDrafts(request, env, decodeURIComponent(draftMatch[1]));
    return response({ status: 'error', message: '지원하지 않는 인증 API입니다.' }, 404);
}
