# AI API 한국 서버 경유 설정 가이드

> 운영 확인일: 2026-08-27 · `trafficcatcher.ai` 한국 서버 경유 정상 작동

## 동작 방식

관리자는 관리자 페이지에서 다음 두 경로 중 하나를 선택합니다.

- `Cloudflare 직접 연결`: Cloudflare Worker가 AI API를 직접 호출합니다.
- `한국 서버 경유`: Cloudflare Worker가 Oracle 한국 서버의 인증 프록시를 거쳐 AI API를 호출합니다.

기본값은 `Cloudflare 직접 연결`입니다. `한국 서버 경유`를 저장한 경우에만 프록시를 사용하며, 중계 실패 시 직접 연결로 임의 전환하지 않고 예약한 글쓰기 쿠폰을 복구합니다.

```text
로그인 사용자
  → Cloudflare Worker: 로그인·글쓰기 권한·쿠폰 확인
  → Oracle 인증 프록시: x-api-key 검증
  → AI API
```

선택값은 D1의 `service_settings.ai_route`에 저장되고 변경 이력은 `admin_audit_logs`에 기록됩니다. 프록시 주소, 프록시 인증키, AI API 키는 브라우저로 반환하지 않습니다.

## 프록시 요청 규격

Worker는 Oracle 프록시의 `/api/proxy`로 다음 형태의 요청을 보냅니다.

```json
{
  "targetUrl": "https://generativelanguage.googleapis.com/v1/interactions",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "X-goog-api-key": "<AI_API_KEY>"
  },
  "body": {
    "model": "gemini-3.5-flash-lite",
    "input": "...",
    "system_instruction": "..."
  }
}
```

프록시 인증키는 외부 요청의 `x-api-key` 헤더로 전달합니다. 응답은 `{ "success": true, "data": ... }` 형식을 사용합니다.

## Cloudflare 운영 환경 설정

Pages/Worker의 운영 환경변수에 아래 값을 Secret으로 등록하고 다시 배포합니다.

```text
GEMINI_API_KEY=<AI API 키>
KOREA_AI_PROXY_URL=http://kr-proxy.trafficcatcher.ai:3000/api/proxy
KOREA_AI_PROXY_KEY=<프록시 x-api-key>
KOREA_AI_PROXY_ALLOW_INSECURE=true
```

프록시 키는 소스나 일반 텍스트 변수에 넣지 않습니다. 대화·로그·화면에 노출된 키는 운영 적용 전에 재발급하는 것을 권장합니다.

## DNS 연결 구성

Cloudflare Worker의 외부 `fetch()`에는 IP 주소를 직접 사용하지 않고 DNS 호스트 이름을 사용합니다. 다음 IP 기반 주소는 Cloudflare에서 403을 반환하므로 사용하지 않습니다.

```text
http://152.67.192.37:3000/api/proxy
```

Cloudflare DNS에 다음 레코드를 등록합니다.

| 항목 | 값 |
| --- | --- |
| Type | `A` |
| Name | `kr-proxy` |
| IPv4 | `152.67.192.37` |
| Proxy status | `DNS only` |
| TTL | `Auto` |

3000번 포트는 Cloudflare 프록시 대상 포트가 아니므로 반드시 회색 구름인 `DNS only`로 둡니다. Worker 설정에는 사용자 지정 포트를 실제로 사용하도록 다음 호환성 플래그를 유지합니다.

```toml
compatibility_flags = ["allow_custom_ports"]
```

연결 확인:

```powershell
nslookup kr-proxy.trafficcatcher.ai
Invoke-RestMethod http://kr-proxy.trafficcatcher.ai:3000/
```

정상 헬스체크 응답은 `{ "status": "ok", "message": "Korea proxy server is running" }`입니다.

## 현재 HTTP 연결의 주의 사항

HTTP에서는 프록시 키, AI API 키, 프롬프트와 생성 내용이 암호화되지 않습니다. 운영에서는 Oracle 프록시에 HTTPS 인증서를 연결한 뒤 443 또는 8443 포트로 제공해야 합니다.

현재 HTTP 연결을 허용하려면 다음 일반 환경변수가 필요합니다.

```text
KOREA_AI_PROXY_ALLOW_INSECURE=true
```

이 값이 없으면 `http://` 프록시 주소는 설정 완료로 인정하지 않습니다. 관리자 화면에는 임시 HTTP 연결 상태가 빨간색으로 표시됩니다.

장기 운영에서는 Oracle 서버 앞에 Nginx 또는 Caddy를 구성하고 HTTPS 443으로 전환합니다. HTTPS 전환 후에는 `KOREA_AI_PROXY_ALLOW_INSECURE`를 제거합니다.

## 관리자 화면 사용

1. 관리자 계정으로 로그인합니다.
2. 내 프로필에서 `관리자 권한 설정 및 회원 관리`로 이동합니다.
3. `AI API 연결 방식`에서 `한국 서버 경유`를 선택합니다.
4. `중계 설정 완료`를 확인하고 `연결 방식 저장`을 누릅니다.
5. 다음 AI 연결 확인 및 글쓰기 요청부터 Oracle 프록시가 적용됩니다.

콘텐츠 스튜디오에서는 `/api/gemini/status`의 `route`가 `korea_relay`이고 연결이 정상이어도 화면 문구는 일반 연결과 동일한 `API 연동`으로 표시합니다. 관리자는 버튼 테두리를 따라 시계방향으로 도는 파란색 앰비언트 라인으로 경유 상태를 구분합니다. 직접 연결과 실패 상태에는 이 효과를 적용하지 않습니다.

`서버 설정 필요`가 표시되면 URL 또는 인증키가 누락된 상태입니다. `HTTP 임시 연결`은 암호화되지 않은 주소가 명시적으로 허용된 상태입니다.

## 운영 점검

- `/api/gemini/status` 응답의 `route`가 `korea_relay`인지 확인합니다.
- AI 응답의 `X-AI-Route` 헤더가 `korea_relay`인지 확인합니다.
- 직접 연결 선택 시 Oracle 프록시 호출이 발생하지 않는지 확인합니다.
- 프록시 실패 시 일반 회원의 예약 쿠폰이 복구되는지 확인합니다.
- Oracle 프록시 로그에 전체 프롬프트, AI API 키, 프록시 키를 기록하지 않습니다.

## 장애 진단 기록

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| `한국 서버 프록시 HTTP 403` | Worker가 Oracle IP 주소를 직접 호출 | `kr-proxy.trafficcatcher.ai` DNS 호스트로 변경 |
| 사용자 지정 포트가 무시됨 | Worker 호환성 플래그 누락 | `allow_custom_ports` 유지 |
| `HTTP 임시 연결` 표시 | 프록시 URL이 HTTP | HTTPS 443 전환 권장 |
| 프록시 HTTP 401 | `KOREA_AI_PROXY_KEY` 불일치 | Cloudflare Secret과 Oracle `API_KEY` 재등록 |
| AI API 403 | AI 키 제한·차단·지역 정책 | Google Cloud 키 제한과 Oracle 송신 환경 확인 |

## 보안 제한

프록시 서버에서는 임의 URL 중계를 허용하지 말고 대상 호스트를 `generativelanguage.googleapis.com`으로 제한해야 합니다. 요청 크기 제한, 타임아웃, 속도 제한과 인증 실패 기록도 함께 적용합니다. 이 기능은 네트워크 실행 위치를 선택하는 운영 옵션이며 사용 중인 AI API의 약관과 지역 정책 범위 안에서 사용해야 합니다.
