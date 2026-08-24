const COOKIE_NAME = 'tc_session';
const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DAYS = 30;

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active',
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
        user_id TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT '일상',
        persona TEXT NOT NULL DEFAULT '친근한 이웃 블로거',
        tone_level TEXT NOT NULL DEFAULT 'balanced', detail_level TEXT NOT NULL DEFAULT 'normal',
        custom_instruction TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_ai_instructions (
        user_id TEXT NOT NULL, instruction_type TEXT NOT NULL,
        instruction TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, instruction_type), FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_ui_preferences (
        user_id TEXT PRIMARY KEY, font_family TEXT NOT NULL DEFAULT 'paperlogy',
        font_scale TEXT NOT NULL DEFAULT 'normal', font_weight TEXT NOT NULL DEFAULT '400',
        updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_writing_credits (
        user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
        earned_total INTEGER NOT NULL DEFAULT 0, used_total INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
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
    `CREATE TABLE IF NOT EXISTS role_feature_permissions (
        role TEXT NOT NULL, feature_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY(role, feature_key)
    )`,
    `INSERT OR IGNORE INTO role_feature_permissions(role, feature_key, enabled, updated_at) VALUES
        ('member','dashboard.extended',1,datetime('now')),('member','studio.access',1,datetime('now')),('member','ai.write',1,datetime('now')),('member','ai.personalize',1,datetime('now')),('member','billing.access',1,datetime('now')),('member','admin.members',0,datetime('now')),('member','admin.permissions',0,datetime('now')),
        ('premium','dashboard.extended',1,datetime('now')),('premium','studio.access',1,datetime('now')),('premium','ai.write',1,datetime('now')),('premium','ai.personalize',1,datetime('now')),('premium','billing.access',1,datetime('now')),('premium','admin.members',0,datetime('now')),('premium','admin.permissions',0,datetime('now')),
        ('operator','dashboard.extended',1,datetime('now')),('operator','studio.access',1,datetime('now')),('operator','ai.write',1,datetime('now')),('operator','ai.personalize',1,datetime('now')),('operator','billing.access',1,datetime('now')),('operator','admin.members',1,datetime('now')),('operator','admin.permissions',0,datetime('now')),
        ('admin','dashboard.extended',1,datetime('now')),('admin','studio.access',1,datetime('now')),('admin','ai.write',1,datetime('now')),('admin','ai.personalize',1,datetime('now')),('admin','billing.access',1,datetime('now')),('admin','admin.members',1,datetime('now')),('admin','admin.permissions',1,datetime('now'))`,
];

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

async function ensureDatabase(env) {
    if (!env.AUTH_DB) throw new Error('Cloudflare D1 바인딩 AUTH_DB가 설정되지 않았습니다.');
    await env.AUTH_DB.batch(SCHEMA_STATEMENTS.map((sql) => env.AUTH_DB.prepare(sql)));
    const primaryAdminEmail = String(env.PRIMARY_ADMIN_EMAIL || 'ihnseob@naver.com').trim().toLowerCase();
    if (primaryAdminEmail) {
        await env.AUTH_DB.prepare(
            "UPDATE users SET role='admin', updated_at=? WHERE lower(email)=? AND role!='admin'",
        ).bind(nowIso(), primaryAdminEmail).run();
    }
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
    const mailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.OTP_FROM_EMAIL,
            to: [email],
            subject: '[Traffic Catcher] 로그인 인증번호',
            text: `Traffic Catcher 인증번호는 ${otp}입니다.\n\n인증번호는 5분 동안 유효하며 다른 사람에게 알려주지 마세요.`,
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
            `SELECT u.id, u.email, u.nickname, u.role, u.email_verified_at, s.id AS session_id
             FROM auth_sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.revoked_at IS NULL
               AND s.expires_at > ? AND u.status = 'active'`,
        ).bind(hash, nowIso()).first();
        if (!user) return response({ status: 'anonymous', authenticated: false });
        await env.AUTH_DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').bind(nowIso(), user.session_id).run();
        const permissionRows = await env.AUTH_DB.prepare(
            'SELECT feature_key, enabled FROM role_feature_permissions WHERE role=?',
        ).bind(user.role).all();
        const permissions = Object.fromEntries((permissionRows.results || []).map((row) => [row.feature_key, Boolean(row.enabled)]));
        return response({ status: 'success', authenticated: true, user: serializeUser(user), permissions });
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
        `SELECT u.id, u.email, u.nickname, u.role FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL
           AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
}

async function hasFeature(env, user, featureKey) {
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
        `SELECT u.id, u.role FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (request.method === 'GET') {
        const preference = await env.AUTH_DB.prepare(
            `SELECT category, persona, tone_level, detail_level, custom_instruction, updated_at
             FROM user_ai_preferences WHERE user_id = ?`,
        ).bind(user.id).first();
        return response({ status: 'success', preference: preference || null });
    }
    const payload = await request.json().catch(() => ({}));
    const category = String(payload.category || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const persona = String(payload.persona || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const toneLevel = String(payload.tone_level || 'balanced');
    const detailLevel = String(payload.detail_level || 'normal');
    const customInstruction = String(payload.custom_instruction || '').trim();
    if (!category || !persona) return response({ status: 'error', message: '카테고리와 페르소나를 선택해 주세요.' }, 400);
    if (!['calm', 'balanced', 'lively'].includes(toneLevel) || !['concise', 'normal', 'detailed'].includes(detailLevel)) {
        return response({ status: 'error', message: '지원하지 않는 개인화 설정입니다.' }, 400);
    }
    if (customInstruction.length > 2000) return response({ status: 'error', message: '개인 지침은 2,000자 이내로 입력해 주세요.' }, 400);
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ai_preferences
         (user_id, category, persona, tone_level, detail_level, custom_instruction, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET category=excluded.category, persona=excluded.persona,
         tone_level=excluded.tone_level, detail_level=excluded.detail_level,
         custom_instruction=excluded.custom_instruction, updated_at=excluded.updated_at`,
    ).bind(user.id, category, persona, toneLevel, detailLevel, customInstruction, updatedAt).run();
    return response({ status: 'success', message: 'AI 작성 설정을 저장했습니다.', updated_at: updatedAt });
}

async function personalSystemInstruction(request, env) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    await ensureDatabase(env);
    const hash = await secureHash(authSecret(env), 'session', token);
    const user = await env.AUTH_DB.prepare(
        `SELECT u.id, u.role FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`,
    ).bind(hash, nowIso()).first();
    if (!user) return response({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    if (!await hasFeature(env, user, 'ai.personalize')) return response({ status: 'error', message: '현재 회원 등급에는 AI 개인화 권한이 없습니다.' }, 403);
    const type = new URL(request.url).searchParams.get('type') || 'keyword';
    if (!['keyword', 'story'].includes(type)) return response({ status: 'error', message: '지원하지 않는 지침 유형입니다.' }, 400);
    if (request.method === 'GET') {
        const row = await env.AUTH_DB.prepare(
            'SELECT instruction, updated_at FROM user_ai_instructions WHERE user_id = ? AND instruction_type = ?',
        ).bind(user.id, type).first();
        return response({ status: 'success', instruction: row?.instruction || '', updated_at: row?.updated_at || null });
    }
    const payload = await request.json().catch(() => ({}));
    const instruction = String(payload.instruction || '').trim();
    if (instruction.length < 20) return response({ status: 'error', message: '개인 시스템 지침을 20자 이상 입력해 주세요.' }, 400);
    if (instruction.length > 20000) return response({ status: 'error', message: '개인 시스템 지침은 20,000자를 초과할 수 없습니다.' }, 400);
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ai_instructions (user_id, instruction_type, instruction, updated_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(user_id, instruction_type) DO UPDATE SET
         instruction=excluded.instruction, updated_at=excluded.updated_at`,
    ).bind(user.id, type, instruction, updatedAt).run();
    return response({ status: 'success', message: '개인 시스템 지침을 저장했습니다.', instruction, updated_at: updatedAt, length: instruction.length });
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
            'SELECT font_family, font_scale, font_weight, updated_at FROM user_ui_preferences WHERE user_id = ?',
        ).bind(user.id).first();
        return response({ status: 'success', preference: preference || null });
    }
    const payload = await request.json().catch(() => ({}));
    const fontFamily = String(payload.font_family || 'paperlogy');
    const fontScale = String(payload.font_scale || 'normal');
    const fontWeight = String(payload.font_weight || '400');
    if (!['paperlogy', 'pretendard', 'suit', 'noto', 'system', 'serif'].includes(fontFamily) || !['compact', 'normal', 'large'].includes(fontScale) || !['300', '400', '500'].includes(fontWeight)) {
        return response({ status: 'error', message: '지원하지 않는 화면 글꼴 설정입니다.' }, 400);
    }
    const updatedAt = nowIso();
    await env.AUTH_DB.prepare(
        `INSERT INTO user_ui_preferences (user_id, font_family, font_scale, font_weight, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
         font_family=excluded.font_family, font_scale=excluded.font_scale,
         font_weight=excluded.font_weight, updated_at=excluded.updated_at`,
    ).bind(user.id, fontFamily, fontScale, fontWeight, updatedAt).run();
    return response({ status: 'success', message: '화면 글꼴 설정을 저장했습니다.', updated_at: updatedAt });
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

    if (pathname === '/api/admin/users' && request.method === 'GET') {
        const url = new URL(request.url);
        const query = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const where = query ? 'WHERE lower(u.email) LIKE ? OR lower(u.nickname) LIKE ?' : '';
        const args = query ? [`%${query}%`, `%${query}%`] : [];
        const countStmt = env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM users u ${where}`).bind(...args);
        const listStmt = env.AUTH_DB.prepare(
            `SELECT u.id, u.email, u.nickname, u.role, u.status, u.created_at, u.last_login_at,
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
    const updateMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (updateMatch && request.method === 'PATCH') {
        const userId = decodeURIComponent(updateMatch[1]);
        const payload = await request.json().catch(() => ({}));
        const role = String(payload.role || '');
        const status = String(payload.status || '');
        if (!['member', 'premium', 'operator', 'admin'].includes(role) || !['active', 'suspended'].includes(status)) {
            return response({ status: 'error', message: '지원하지 않는 역할 또는 상태입니다.' }, 400);
        }
        if (userId === admin.id && (role !== 'admin' || status !== 'active')) {
            return response({ status: 'error', message: '현재 로그인한 관리자 자신의 권한은 해제할 수 없습니다.' }, 409);
        }
        const before = await env.AUTH_DB.prepare('SELECT role, status FROM users WHERE id=?').bind(userId).first();
        if (!before) return response({ status: 'error', message: '회원을 찾을 수 없습니다.' }, 404);
        const current = nowIso();
        const statements = [
            env.AUTH_DB.prepare('UPDATE users SET role=?, status=?, updated_at=? WHERE id=?').bind(role, status, current, userId),
            env.AUTH_DB.prepare("INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, before_value, after_value, created_at) VALUES (?, ?, 'user.update', ?, ?, ?, ?)")
                .bind(crypto.randomUUID(), admin.id, userId, `${before.role}|${before.status}`, `${role}|${status}`, current),
        ];
        if (status !== 'active') statements.push(env.AUTH_DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(current, userId));
        await env.AUTH_DB.batch(statements);
        return response({ status: 'success', message: '회원 권한을 저장했습니다.' });
    }

    const creditMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits$/);
    if (creditMatch && request.method === 'POST') {
        const userId = decodeURIComponent(creditMatch[1]);
        const payload = await request.json().catch(() => ({}));
        const amount = Number.parseInt(payload.amount, 10);
        if (!Number.isInteger(amount) || amount < 1 || amount > 1000) return response({ status: 'error', message: '쿠폰은 1~1,000건까지 지급할 수 있습니다.' }, 400);
        if (!await env.AUTH_DB.prepare('SELECT 1 FROM users WHERE id=?').bind(userId).first()) return response({ status: 'error', message: '회원을 찾을 수 없습니다.' }, 404);
        const current = nowIso();
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
        const features = new Set(['dashboard.extended', 'studio.access', 'ai.write', 'ai.personalize', 'billing.access', 'admin.members', 'admin.permissions']);
        if (!roles.has(role) || !permissions || typeof permissions !== 'object' || Object.keys(permissions).some((key) => !features.has(key))) {
            return response({ status: 'error', message: '지원하지 않는 역할 또는 기능 권한입니다.' }, 400);
        }
        if (role === 'admin') { permissions['admin.members'] = true; permissions['admin.permissions'] = true; }
        if (role !== 'admin') permissions['admin.permissions'] = false;
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
    return response({
        status: 'success', balance: Number(credit?.balance || 0),
        earned_total: Number(credit?.earned_total || 0), used_total: Number(credit?.used_total || 0),
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
    if (pathname === '/api/auth/request-otp' && request.method === 'POST') return requestOtp(request, env);
    if (pathname === '/api/auth/verify-otp' && request.method === 'POST') return verifyOtp(request, env);
    if (pathname === '/api/auth/session' && request.method === 'GET') return sessionStatus(request, env);
    if (pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
    if (pathname === '/api/auth/preferences/ai-persona' && ['GET', 'PUT'].includes(request.method)) return aiPersonaPreferences(request, env);
    if (pathname === '/api/auth/preferences/system-instruction' && ['GET', 'PUT'].includes(request.method)) return personalSystemInstruction(request, env);
    if (pathname === '/api/auth/preferences/ui' && ['GET', 'PUT'].includes(request.method)) return uiPreferences(request, env);
    if (pathname === '/api/auth/referrals/status' && request.method === 'GET') return referralStatus(request, env);
    if (pathname === '/api/auth/referrals/claim' && request.method === 'POST') return claimReferral(request, env);
    return response({ status: 'error', message: '지원하지 않는 인증 API입니다.' }, 404);
}

