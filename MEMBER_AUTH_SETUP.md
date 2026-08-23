# Traffic Catcher 이메일 OTP 회원 인증 설정

회원가입과 로그인은 같은 이메일 OTP 흐름을 사용한다. 처음 인증한 이메일은 회원 DB에 자동 등록되고, 이후에는 같은 방식으로 로그인한다. 수집하는 필수 정보는 이메일과 닉네임뿐이다.

## 로컬 Flask 설정

로컬 회원 정보는 Git에서 제외된 `.traffic_catcher_members.db` SQLite 파일에 저장된다.

프로젝트 루트의 `.env`에 다음 값을 설정한다.

```env
TRAFFIC_CATCHER_AUTH_SECRET=충분히-긴-무작위-문자열
TRAFFIC_CATCHER_SMTP_HOST=smtp.example.com
TRAFFIC_CATCHER_SMTP_PORT=587
TRAFFIC_CATCHER_SMTP_USER=no-reply@example.com
TRAFFIC_CATCHER_SMTP_PASSWORD=SMTP_APP_PASSWORD
TRAFFIC_CATCHER_SMTP_TLS=1
TRAFFIC_CATCHER_OTP_FROM_EMAIL=no-reply@example.com
```

SMTP 설정이 없으면 로컬 개발 모드로 동작하며 6자리 OTP가 서버 실행 창에만 표시된다. 외부에 공개된 서버에서는 반드시 SMTP와 `TRAFFIC_CATCHER_AUTH_SECRET`을 설정한다.

## Cloudflare Pages 설정

Cloudflare 대시보드에서 Pages 프로젝트의 Worker 바인딩과 Secrets를 설정한다.

### D1 바인딩

1. D1 데이터베이스를 새로 생성한다.
2. Pages 프로젝트의 D1 바인딩 변수 이름을 `AUTH_DB`로 지정한다.
3. 운영과 Preview 환경에 필요한 바인딩을 각각 설정한다.

인증 API가 처음 호출될 때 `auth_schema.sql`과 같은 회원·OTP·세션 테이블을 자동 준비한다.

### Secrets와 환경 변수

```text
AUTH_SECRET       24자 이상의 무작위 비밀 문자열
RESEND_API_KEY    Resend 이메일 API 키
OTP_FROM_EMAIL    인증된 발신자 (예: Traffic Catcher <login@example.com>)
```

`AUTH_SECRET`과 `RESEND_API_KEY`는 일반 변수 대신 암호화된 Secret으로 등록한다. `OTP_FROM_EMAIL`의 도메인은 메일 서비스에서 발신 인증을 완료해야 한다.

## 인증 API

| API | 용도 |
|---|---|
| `POST /api/auth/request-otp` | 이메일과 닉네임을 받아 6자리 OTP 발송 |
| `POST /api/auth/verify-otp` | OTP 검증, 최초 회원 생성, 로그인 쿠키 발급 |
| `GET /api/auth/session` | 현재 로그인 회원 확인 |
| `POST /api/auth/logout` | 서버 세션 폐기 및 쿠키 삭제 |

OTP는 5분 동안 유효하고 60초 후 재발송할 수 있으며 최대 5회까지 입력할 수 있다. OTP와 세션 토큰 원문은 DB에 저장하지 않고 비밀값을 적용한 해시만 저장한다. 로그인 쿠키는 JavaScript에서 읽을 수 없는 `HttpOnly`, `SameSite=Lax` 방식이다.

## 다음 보안 단계

- Cloudflare Turnstile을 OTP 요청 화면에 연결한다.
- IP·이메일 조합의 시간당 요청 제한을 추가한다.
- 개인정보 처리방침, 이용약관, 만 14세 이상 확인을 가입 흐름에 연결한다.
- 휴면·탈퇴 회원 삭제 정책과 개인정보 내보내기 기능을 구현한다.

