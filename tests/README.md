# 테스트

릴리즈 전에 무엇을 돌리는지는 [`../docs/RELEASE.md`](../docs/RELEASE.md)다.

| 경로 | 종류 | 언제 | 설명 |
|---|---|---|---|
| `tests/mcp/*.test.mjs` | 자동 단위·통합 (DB 모의/임시 소켓) | 커밋 전, 릴리즈 전 (`npm test`) | 필수. 서버 실행 없이 MCP 계약·CORS·인증 검증 |
| `tests/release/mcp-http.live.test.mjs` | 자동 실서버 테스트 (Strict 모드) | 릴리즈 전, CI (`npm run test:release` 또는 `npm run test:release:strict`) | **필수 (Strict)**. MCP HTTP 서버 미가동 시 즉시 실패하여 무단 통과 방지 |
| `tests/release/mcp-http.live.test.mjs` | 개발자 스모크 테스트 (Smoke 모드) | 로컬 개발 중 (`npm run test:smoke` 또는 `npm run test:release:smoke`) | **선택 (Smoke)**. 서버가 꺼져 있으면 skip하여 빠른 로컬 작업 지원 |
| `tests/release/*.md` | 사람이 하는 체크리스트 | 웹 Pages 배포, MCP 서버 변경 | 실서버·클라이언트 수동 확인 |

새 기능이 `docs/FEATURES.md`에서 `shipped`가 되면 여기 한 줄을 추가한다. 로직 변경은 `*.test.mjs`, 클릭·로그인·실서버는 `tests/release/*.md`.

## 실행 명령

```powershell
# 1. 단위·계약 테스트 (오프라인)
npm test

# 2. 릴리즈 필수 테스트 (Strict 모드: 실서버 미가동 시 실패)
npm run test:release

# 3. 로컬 개발용 스모크 테스트 (Smoke 모드: 서버 꺼져 있으면 skip)
npm run test:smoke
```

## 환경변수 및 모드 제어

- `MOA_MCP_HEALTH_URL`: 실서버 health 확인 URL (기본값: `http://127.0.0.1:8787/health`)
- `MOA_MCP_URL`: 실서버 MCP 엔드포인트 URL (기본값: `http://127.0.0.1:8787/mcp`)
- `MOA_MCP_LIVE_MODE`: `strict` (기본값, 서버 미가동 시 실패) 또는 `smoke` (서버 미가동 시 skip)
- `MOA_MCP_STRICT_LIVE`: `true`/`1` (strict) 또는 `false`/`0` (smoke)
