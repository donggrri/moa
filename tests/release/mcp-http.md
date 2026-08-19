# 릴리즈 테스트 — MCP HTTP

대상: 이 PC가 서버, Cursor가 클라이언트. `127.0.0.1:8787`.

자동:
- 단위·계약 검증: 저장소 루트에서 `npm test`
- 실서버 필수 검증 (Strict 모드, 미가동 시 실패): 서버 가동 후 `npm run test:release`
- 개발 중 임의 스모크 점검 (Smoke 모드, 미가동 시 skip): `npm run test:smoke`

## 필수 (로컬 서버)

- [ ] `mcp-server/.env`가 있고 Git에 없음
- [ ] 저장소 루트에서 `npm --prefix mcp-server run http:start` 또는 로그온 작업 후 `http://127.0.0.1:8787/health`가 `{"ok":true}`
- [ ] `npm run test:release` (Strict 모드) 통과
- [ ] Bearer 없이 `POST /mcp` → 401
- [ ] Cursor MCP `moa`가 `http://127.0.0.1:8787/mcp` (STDIO `command`가 아님)
- [ ] Cursor를 재시작한 뒤 `list_spaces`가 내 공간만 반환
- [ ] `list_tasks` 또는 `get_today_tasks`로 할일이 보임
- [ ] 클라이언트 설정에 `service_role`이 없음
- [ ] PC를 끄면 Cursor MCP가 붙지 않음 (의도)

## 자동 시작

- [ ] `npm run http:install` 후 작업 스케줄러에 `MoaMcpHttp`
- [ ] 사용자 환경변수 `MOA_MCP_TOKEN`이 `.env`의 `MOA_MCP_TOKENS` 왼쪽과 같음
- [ ] 로그아웃/재로그온 후 health가 다시 ok

## 이후 파이·터널 (아직 필수 아님)

- [ ] 파이에서 `node server.mjs --http`, health ok
- [ ] systemd 유닛 enable
- [ ] 터널 HTTPS URL로 회사 Cursor가 같은 Bearer로 `list_spaces`
- [ ] 파이 방화벽에 8787 직접 공개 없음
