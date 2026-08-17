# 테스트

릴리즈 전에 무엇을 돌리는지는 [`../docs/RELEASE.md`](../docs/RELEASE.md)다.

| 경로 | 종류 | 언제 |
|---|---|---|
| `tests/mcp/*.test.mjs` | 자동, DB 없이 MCP 계약·HTTP 인증 | 커밋 전, 릴리즈 전 (`npm test`) |
| `tests/release/*.test.mjs` | 자동, 로컬 서버가 있을 때만 | 릴리즈 전 (`npm run test:release`) |
| `tests/release/*.md` | 사람이 하는 체크리스트 | 웹 Pages 배포, MCP 서버 변경 |

새 기능이 `docs/FEATURES.md`에서 `shipped`가 되면 여기 한 줄을 추가한다. 로직 변경은 `*.test.mjs`, 클릭·로그인·실서버는 `tests/release/*.md`.

```powershell
npm test
npm run test:release
```

`test:release`는 MCP HTTP가 안 떠 있으면 해당 항을 skip한다. 실패로 보지 않는다. 실서버 확인이 필요하면 체크리스트를 비우지 않는다.
