# 기능 대장

완료된 기능은 여기서 관리한다. `PROJECT_PLAN.md`는 미완 작업만 길게 남긴다.

상태: `shipped` 코드·문서 반영됨 · `in_progress` 이어서 함 · `next` 곧 함 · `parked` 보류

테스트 열은 [`../tests/README.md`](../tests/README.md) 기준이다.

## shipped

| ID | 기능 | 반영 위치 | 테스트 | 비고 |
|---|---|---|---|---|
| WEB-AUTH | 이메일 로그인·회원가입·비밀번호 재설정 | `app.js`, `index.html`, Supabase Auth | `tests/release/web-app.md` | Confirm email은 로컬에서 끌 수 있음 |
| WEB-SPACE | 공동 공간 생성·초대 코드·링크 참여 | `join_space` RPC, 화면 | `tests/release/web-app.md` | 두 계정 실기기 검증은 미완 |
| WEB-TASK | 할일 CRUD, 담당자, 완료, 연기, 반복 | tasks RPC, Realtime | `tests/release/web-app.md` | 동시 완료 실기기 검증은 미완 |
| WEB-IDEA | 아이디어 저장·보관·할일 전환 | ideas, `convert_idea_to_task` | `tests/release/web-app.md` | |
| WEB-PAGES | GitHub Pages 배포 + publishable key | Pages, `supabase-config.js` | `tests/release/web-app.md` | 회사 PC는 웹만 Pages URL |
| TASK-OVERDUE | 지난 할일 삭제하지 않음 | 도메인, 오늘/전체 화면 | `tests/release/web-app.md` | 오늘 화면에서 빠지고 전체에서 지연 |
| MCP-TOOLS | 공간·할일·아이디어 MCP 도구 | `mcp-server/server.mjs` | `tests/mcp/server.test.mjs` | 임의 SQL 없음 |
| MCP-HTTP | HTTP `POST /mcp`, Bearer, Origin 검사 | `server.mjs --http` | `tests/mcp/server.test.mjs`, `tests/release/mcp-http.md` | `127.0.0.1`만. 인터넷 직접 공개 안 함 |
| MCP-PC-SERVER | PC가 서버, Cursor가 HTTP 클라이언트 | `.cursor/mcp.json`, `scripts/*.ps1` | `tests/release/mcp-http.md` | PC가 꺼지면 서버도 멈춤. `.env` 실값은 로컬만 |

## in_progress

| ID | 기능 | 다음에 할 일 | 테스트 |
|---|---|---|---|
| MCP-PC-RUN | 이 PC에서 HTTP 서버 실가동 | `mcp-server/.env` 채우기, `npm run http:install`, Cursor 재시작 후 도구 호출 | `tests/release/mcp-http.md` 실서버 절 |

## next

| ID | 기능 | 의존 | 문서 |
|---|---|---|---|
| MCP-PI | 라즈베리파이에 같은 HTTP 서버 + systemd | MCP-PC-RUN 확인 후 | `CONTINUE.md`, `mcp-server/scripts/moa-mcp-http.service` |
| MCP-TUNNEL | Cloudflare Tunnel로 회사 PC Cursor 연결 | MCP-PI | `CONTINUE.md` |
| WEB-TWO-USER | 두 계정 초대·동시 완료 실기기 검증 | WEB-SPACE, WEB-TASK | `tests/release/web-app.md` |
| WEB-OVERDUE-UX | 오늘 화면에 지연 할일 표시 여부 | TASK-OVERDUE | `PROJECT_PLAN.md` |
| WEB-RECURRENCE-POLICY | 반복 수정 이번/이후/과거 보존 | WEB-TASK | `PROJECT_PLAN.md` |
| NOTIFY | Reminder·웹 푸시 | 실사용 검증 후 | Phase 4 |
| KAKAO | 카카오 공유·메시지 | NOTIFY 이후 | Phase 4 |

## parked

없음.

## 완료 처리 방법

1. 코드가 머지·푸시될 수준이면 이 파일에서 `in_progress` → `shipped`로 옮긴다.
2. 자동 테스트가 있으면 `tests/`에 두고 이 표의 테스트 칸에 경로를 적는다. 사람이 눌러 보는 항목은 `tests/release/`에 체크리스트로 남긴다.
3. `PROJECT_PLAN.md` 상단 표와 **다음 작업 순서**만 짧게 맞춘다. 완료 서사는 여기 둔다.
4. 사용자 사용법이 바뀌면 `README.md`(필요 시 하위 README)를 고친다.
5. 다음 세션 손 위치가 바뀌면 `CONTINUE.md`를 고친다.
