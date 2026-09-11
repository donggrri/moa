# 이어서 하기 — MCP 서버

마지막 갱신: 2026-09-11

MCP 서버 **코드와 계약 테스트는 있다.** 실서버·클라이언트 조회는 **나중에 테스트**한다. 라즈베리파이는 그 확인 다음이다.

## 지금 코드 상태

- HTTP 서버: `mcp-server/server.mjs --http` (`POST /mcp`, `GET /health`)
- Cursor 클라이언트: `.cursor/mcp.json` → `http://127.0.0.1:8787/mcp` + `Authorization: Bearer ${env:MOA_MCP_TOKEN}`
- Windows 로그온 자동 시작: `mcp-server/scripts/install-startup.ps1` (`npm run http:install`)
- 파이용 유닛 예시: `mcp-server/scripts/moa-mcp-http.service` (아직 설치하지 않음)
- 계약 테스트: `tests/mcp/server.test.mjs` (`npm test`). DB 없이 입력·권한·JSON-RPC만 검증. 지금 돌려도 된다.
- **나중에 할 테스트 (MCP-PC-RUN)**: `mcp-server/.env` 실값, `http:install`, health, Cursor/Grok에서 `list_spaces`·할일 조회. 체크리스트는 [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md).

2026-09-11 확인: `.env` 없음, `127.0.0.1:8787` 닫힘, `MOA_MCP_TOKEN` 없음, 작업 스케줄러 `MoaMcpHttp` 없음. Grok `moa` 핸드셰이크 실패는 이 때문이다.

## 나중에 할 일 (PC 실서버 테스트)

지금 세션에서 하지 않는다. `.env`와 운영 토큰이 준비되면 아래를 수행한다.

1. `mcp-server/.env.example`을 `.env`로 복사한다.
2. `MOA_SUPABASE_URL`, `MOA_SUPABASE_SERVICE_ROLE_KEY`, `MOA_MCP_TOKENS=16자이상토큰:auth-uuid`를 넣는다. Auth UUID는 Supabase Authentication → Users.
3. `cd mcp-server` 후 `npm run http:install` → 로그온 작업 등록 + 사용자 환경변수 `MOA_MCP_TOKEN`.
4. Cursor(및 Grok)를 재시작한다.
5. [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md)의 필수 항목을 체크한다. 서버가 떠 있으면 `MOA_MCP_REQUIRE_LIVE=1` 후 `npm run test:release`도 돌린다.

실패 시: `http://127.0.0.1:8787/health`가 `{"ok":true}`인지, 클라이언트에 `service_role`이 들어가지 않았는지 본다. 통과하면 `FEATURES.md`의 `MCP-PC-RUN`을 `shipped`로 옮긴다.

## 그다음 (라즈베리파이)

PC에서 도구 호출이 되면 같은 `mcp-server/`와 `.env`를 파이에 복사한다.

1. Node 18+, `127.0.0.1:8787`로 `node server.mjs --http`
2. `scripts/moa-mcp-http.service` 경로를 고쳐 `systemctl enable --now`
3. 공유기 포트포워딩 대신 Cloudflare Tunnel
4. 회사 Cursor `url`만 `https://터널/mcp`로 바꾸고 Bearer는 유지
5. `FEATURES.md`에서 `MCP-PI`, `MCP-TUNNEL`을 `shipped`로 옮긴다

Cloud Agent VM은 이 서버를 호스팅하지 않는다. 클라이언트일 뿐이다.

## 이 작업과 무관한 제품 다음 일

두 계정 실사용, 반복 수정 정책, 알림. 목록은 `PROJECT_PLAN.md`와 `FEATURES.md`의 `next`를 본다.
