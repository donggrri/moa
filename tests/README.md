# 테스트

무엇을 자동으로 막고, 무엇을 손으로 보는지는 여기가 원본이다. 릴리즈 게이트의 실행 순서는 [`../docs/RELEASE.md`](../docs/RELEASE.md)와 `.github/workflows/release.yml`이다.

## 원칙

- 비밀 값, 실계정, 외부 동의 화면이 필요하면 자동 게이트에 넣지 않는다.
- 순수 로직과 정적 자산은 `npm test` / `npm run test:web`으로 막는다.
- 로그인·Realtime·카카오 동의·Cursor 연결은 `tests/release/*.md` 체크리스트다.
- 카카오 실로그인은 CI에 넣지 않는다. 초대/OAuth URL 로직과 번들의 카카오 버튼만 자동이고, 동의 화면부터는 [`release/web-kakao.md`](release/web-kakao.md)다.
- Playwright 같은 브라우저 E2E는 지금 도입하지 않는다.

## 명령

| 경로 | 종류 | 명령 | 역할 |
|---|---|---|---|
| `tests/mcp/*.test.mjs` | 자동 계약 테스트 | `npm test` | DB 없이 MCP 입력·권한·JSON-RPC 검증. **지금 가능** |
| `tests/web/task-visibility.test.mjs` | 자동 화면 로직 | `npm test` | 오늘 화면 지연 할일 선택·집계 |
| `tests/web/auth-flow.test.mjs` | 자동 화면 로직 | `npm test` | 초대 코드와 카카오 OAuth 콜백 구분, 초대 보존, 닉네임 매핑 |
| `tests/release/web-static.test.mjs` | 자동 정적 smoke | `npm run test:web` | 실제 정적 서버와 Pages 자산. 카카오 버튼·`signInWithOAuth`가 번들에 있는지 |
| `tests/release/mcp-http.live.test.mjs` | 자동 HTTP smoke | `npm run test:release` | health와 bearer 경로. **실서버가 있을 때. 나중에 (`MCP-PC-RUN`)** |
| mutation | Stryker | `npm run test:mutate` | MCP 구현 변경이 있는 `main` 릴리즈 후보의 MCP 회귀 검증 |
| `tests/release/web-app.md` | 수동 운영 확인 | 체크리스트 | 이메일 로그인, 공간, 할일, 지연 화면 |
| `tests/release/web-kakao.md` | 수동 운영 확인 | 체크리스트 | 카카오 실로그인, 초대+카카오, Pages |
| `tests/release/mcp-http.md` | 수동 운영 확인 | 체크리스트 | PC HTTP + Cursor/Grok 조회. **아직 안 함. 나중에 (`MCP-PC-RUN`)** |

CI에서는 MCP 서버를 먼저 기동하고 `MOA_MCP_REQUIRE_LIVE=1`을 지정한다. 따라서 서버가 없을 때 테스트가 skip되지 않고 실패한다. 로컬 실서버·클라이언트 조회는 CI와 별개이며, `.env`를 채운 뒤에 `mcp-http.md`로 한다.

## 언제 무엇을

| 상황 | 자동 | 손 확인 |
|---|---|---|
| 웹·MCP 코드를 고친 뒤 | `npm test`, 웹이면 `npm run test:web` | 해당 화면만 `web-app.md` |
| 카카오 로그인 코드·문구를 고친 뒤 | `npm test`, `npm run test:web` | Provider 설정이 되어 있으면 `web-kakao.md` 로컬 절 |
| Kakao Developers·Supabase Kakao를 처음 연결한 뒤 | 없음 | `web-kakao.md` 전체를 로컬에서 |
| Pages 배포 후 | CI 게이트 | `web-app.md`, 카카오면 `web-kakao.md` Pages 절 |
| MCP 서버를 바꾼 뒤 | `npm test`. 실서버는 **나중에** `.env` 후 `npm run test:release` | `mcp-http.md` (`MCP-PC-RUN`) |

새 기능이 `docs/FEATURES.md`에서 `shipped`가 되면 관련 테스트 경로를 이 표와 문서에 반영한다. 로직 변경은 `*.test.mjs`, 정적 배포는 `web-static.test.mjs`, 실제 로그인·Realtime·카카오 동의·Cursor 동작은 릴리즈 체크리스트에 둔다.
