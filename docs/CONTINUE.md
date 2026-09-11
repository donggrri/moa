# 이어서 하기 — MCP 서버

마지막 갱신: 2026-08-17

이 세션의 목표: **이 PC가 켜져 있을 때만** MCP HTTP 서버가 처리하고, Cursor는 클라이언트다. 라즈베리파이는 그다음이다.

## 지금 코드 상태

- HTTP 서버: `mcp-server/server.mjs --http` (`POST /mcp`, `GET /health`)
- Cursor 클라이언트: `.cursor/mcp.json` → `http://127.0.0.1:8787/mcp` + `Authorization: Bearer ${env:MOA_MCP_TOKEN}`
- Windows 로그온 자동 시작: `mcp-server/scripts/install-startup.ps1` (`npm run http:install`)
- 파이용 유닛 예시: `mcp-server/scripts/moa-mcp-http.service` (아직 설치하지 않음)
- 단위 테스트: `tests/mcp/server.test.mjs` (통과)
- **아직 안 함**: 이 PC에 `mcp-server/.env` 실값, `http:install` 실행, Cursor에서 실제 할일 조회

## 바로 할 일 (PC 서버)

1. `mcp-server/.env.example`을 `.env`로 복사한다.
2. `MOA_SUPABASE_URL`, `MOA_SUPABASE_SERVICE_ROLE_KEY`, `MOA_MCP_TOKENS=16자이상토큰:auth-uuid`를 넣는다. Auth UUID는 Supabase Authentication → Users.
3. `cd mcp-server` 후 `npm run http:install` → 로그온 작업 등록 + 사용자 환경변수 `MOA_MCP_TOKEN`.
4. Cursor를 재시작한다.
5. [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md)를 수행한다.

실패 시: `http://127.0.0.1:8787/health`가 `{"ok":true}`인지, Cursor에 `service_role`이 들어가지 않았는지 본다.

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
