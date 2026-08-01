# 모아 — 공동생활 할일 관리

가족·커플·소규모 팀이 함께 할일과 아이디어를 관리하는 정적 웹 앱입니다.

## 기능

- 이메일 회원가입·로그인·비밀번호 재설정
- 공동 공간 생성과 초대 코드·링크 참여
- 할일 추가, 담당자 지정, 완료/되돌리기, 하루 연기
- 일·주·평일·월 반복 일정
- 아이디어 저장·검색·보관·할일 전환
- Supabase Realtime 기반 공동 공간 동기화
- Codex 연동을 위한 로컬 MCP 서버

## Supabase 연결

1. Supabase 프로젝트를 만듭니다.
2. `supabase/migrations/001_initial_schema.sql`을 SQL Editor에서 실행합니다.
3. Authentication URL 설정에 다음 주소를 등록합니다.

```text
https://donggrri.github.io/moa/
http://localhost:5173/
```

4. `supabase-config.example.js`를 참고해 `supabase-config.js`에 Project URL과 publishable/anon key를 입력합니다.
5. `index.html`을 새로고침합니다.

브라우저에는 publishable/anon key만 사용합니다. `service_role` key, DB 비밀번호, PostgreSQL 연결 문자열은 프론트엔드나 GitHub에 넣지 마세요.

상세한 SQL 적용 방법은 [`supabase/README.md`](supabase/README.md)를 참고하세요.

## 로컬 실행

프로젝트 폴더에서 실행하세요.

```powershell
node server.mjs
```

브라우저 주소: `http://localhost:5173/`

Supabase 설정이 비어 있으면 앱이 설정 안내 화면을 표시합니다. 업무 데이터는 더 이상 브라우저 `localStorage`에 저장하지 않습니다.

## MCP 서버

MCP 서버는 웹과 같은 Supabase 도메인 계약·멤버십 검사를 사용하며 임의 SQL 도구를 노출하지 않습니다. 자세한 환경변수와 Codex 연결 방법은 [`mcp-server/README.md`](mcp-server/README.md)를 참고하세요.
