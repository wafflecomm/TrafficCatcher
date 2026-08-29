# Traffic Catcher 저장소 작업 지침

## 문서 작성

- 독립 실행형 `.html` 문서는 기본 글꼴로 `Paperlogy`를 사용한다.
- HTML `<head>`에서 다음 스타일시트를 불러온다.

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/subsets/Paperlogy-dynamic-subset.css">
```

- 본문 글꼴 스택은 다음을 기본으로 한다.

```css
font-family: Paperlogy, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- 코드·로그·Cron 표현은 `Consolas`, `Courier New`, monospace 계열을 유지한다.
- 같은 문서의 `.md`와 `.html`이 함께 있으면 내용과 최종 갱신일을 같이 수정한다.
- 모바일 가독성과 인쇄 스타일을 포함하고 UTF-8로 저장한다.

## 화면 디자인

- 공통 화면·폰트 규칙은 `docs/design/TRAFFIC_CATCHER_DESIGN_GUIDE.md`와 대응 HTML을 기준으로 한다.
- 사용자의 기존 변경과 관련 없는 파일은 되돌리지 않는다.