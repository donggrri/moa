# 테스트

릴리즈 게이트의 전체 순서는 [`../docs/RELEASE.md`](../docs/RELEASE.md)와 `.github/workflows/release.yml`에 정의되어 있다.

| 경로 | 종류 | 명령 | 역할 |
|---|---|---|---|
| `tests/mcp/*.test.mjs` | 자동 계약 테스트 | `npm test` | DB 없이 MCP 입력·권한·JSON-RPC 검증 |
| `tests/web/*.test.mjs` | 자동 화면 로직 | `npm test` | 오늘 화면 지연 할일 선택·집계, 카카오 OAuth 초대 보존 |
| `tests/release/web-static.test.mjs` | 자동 정적 smoke | `npm run test:web` | 실제 정적 서버와 Pages 자산 검증 |
| `tests/release/mcp-http.live.test.mjs` | 자동 HTTP smoke | `npm run test:release` | health와 bearer 경로 검증 |
| mutation | Stryker | `npm run test:mutate` | MCP 구현 변경이 있는 `main` 릴리즈 후보의 회귀 검증 |
| `tests/release/*.md` | 수동 운영 확인 | 체크리스트 | Pages 로그인·Supabase·Cursor MCP 확인 |

CI에서는 MCP 서버를 먼저 기동하고 `MOA_MCP_REQUIRE_LIVE=1`을 지정한다. 따라서 서버가 없을 때 테스트가 skip되지 않고 실패한다.

새 기능이 `docs/FEATURES.md`에서 `shipped`가 되면 관련 테스트 경로를 이 표와 문서에 반영한다. 로직 변경은 `*.test.mjs`, 정적 배포는 `web-static.test.mjs`, 실제 로그인·Realtime·Cursor 동작은 릴리즈 체크리스트에 둔다.
