# 모아 — 공동생활 할일 관리

가족·커플·소규모 팀이 함께 할일과 아이디어를 관리하는 웹 앱입니다. 데이터는 브라우저가 아니라 Supabase에 저장됩니다.

- 로컬: `http://localhost:5173/`
- 배포: [https://donggrri.github.io/moa/](https://donggrri.github.io/moa/)

회사 PC에서는 Node를 켜지 말고 배포 주소로 로그인하면 됩니다. 집 노트북과 같은 계정을 사용합니다.

## 현재 상태 (2026-08-17)

- 이메일 로그인, 공동 공간, 초대, 할일, 반복, 아이디어는 Supabase에 연결됨
- GitHub Pages에 publishable key가 반영됨
- MCP는 이 PC의 HTTP 서버(`127.0.0.1:8787`) + Cursor 클라이언트. 실제 조회는 `mcp-server/.env`가 필요함. 이후 서버는 라즈베리파이로 옮길 예정
- 알림·카카오 연동은 아직 없음
- 날짜가 지난 할일은 삭제되지 않음. **오늘** 화면에서는 안 보이고 **전체 할일**에서 지연으로 보임

이어서 할 일: [`docs/CONTINUE.md`](docs/CONTINUE.md)  
기능 상태: [`docs/FEATURES.md`](docs/FEATURES.md)  
문서 어디에 쓸지: [`docs/README.md`](docs/README.md)  
릴리즈 테스트: [`docs/RELEASE.md`](docs/RELEASE.md) · [`tests/`](tests/)

## 기능

- 이메일 회원가입·로그인·비밀번호 재설정
- 공동 공간 생성과 초대 코드·링크 참여
- 할일 추가, 담당자 지정, 완료/되돌리기, 하루 연기
- 일·주·평일·월 반복 일정
- 아이디어 저장·검색·보관·할일 전환
- 공간 노트: 마크다운 작성, 이미지, `#태그` 검색, `[[위키링크]]` 그래프, 읽기 전용 공개 페이지
- Supabase Realtime 기반 공동 공간 동기화
- Cursor 연동을 위한 로컬 MCP HTTP 서버 (PC가 켜져 있을 때만 처리)

## Supabase 연결

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 아래 파일을 **순서대로** 실행합니다.

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_space_notes.sql
```
3. Authentication URL 설정에 다음 주소를 등록합니다.

```text
https://donggrri.github.io/moa/
http://localhost:5173/
```

로컬만 빠르게 쓰려면 Authentication → Providers → Email에서 Confirm email을 꺼도 됩니다.

4. `supabase-config.example.js`를 참고해 `supabase-config.js`에 Project URL과 publishable/anon key를 입력합니다. 새 대시보드에는 `anon` 대신 **Publishable key** (`sb_publishable_...`)가 있습니다.
5. 페이지를 새로고침합니다.

브라우저에는 publishable/anon key만 사용합니다. `service_role` key, DB 비밀번호, PostgreSQL 연결 문자열은 프론트엔드나 GitHub에 넣지 마세요.

상세한 SQL 적용 방법은 [`supabase/README.md`](supabase/README.md)를 참고하세요.

## 로컬 실행

프로젝트 폴더에서 실행하세요.

```powershell
node server.mjs
```

브라우저 주소: `http://localhost:5173/`

Supabase 설정이 비어 있으면 앱이 설정 안내 화면을 표시합니다.

## MCP 서버

웹과 같은 Supabase 도메인 계약·멤버십 검사를 사용하며 임의 SQL 도구를 노출하지 않습니다. GitHub Pages는 MCP를 호스팅하지 않습니다.

지금 단계는 **이 PC가 서버, Cursor가 클라이언트**입니다. PC가 꺼지면 MCP도 멈춥니다.

```powershell
cd mcp-server
# .env에 URL, service_role, MOA_MCP_TOKENS=긴토큰:auth-uuid 를 넣은 뒤
npm run http:install
```

Cursor는 `http://127.0.0.1:8787/mcp` + Bearer만 사용합니다. `service_role`은 클라이언트에 넣지 마세요. 이후 같은 서버를 라즈베리파이로 옮깁니다.

자세한 내용은 [`mcp-server/README.md`](mcp-server/README.md)를 참고하세요.

## 테스트

```powershell
npm test
npm run test:release
```

릴리즈 전에 사람이 하는 항목은 [`tests/release/`](tests/release/)와 [`docs/RELEASE.md`](docs/RELEASE.md)입니다.
