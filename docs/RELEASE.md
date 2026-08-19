# 릴리즈

GitHub Pages 웹과 MCP HTTP는 따로 배포한다. Pages는 MCP를 호스팅하지 않는다.

## 언제

- `main`에 사용자 보이는 웹 변경이 들어갈 때 → 웹 릴리즈
- MCP 도구·인증·실행 방법이 바뀔 때 → MCP 릴리즈 (지금은 이 PC, 이후 파이)
- 둘 다면 아래 순서를 모두 한다

## 공통

1. 비밀 값이 커밋에 없는지 확인한다 (`.env`, `service_role`, Bearer 실토큰).
2. 문서 지도를 따라 `FEATURES.md`, README, `CONTINUE.md`를 맞춘다.
3. 저장소 루트에서 단위 자동 테스트를 돌린다.

```powershell
npm test
```

실패하면 배포하지 않는다.

## 웹 (GitHub Pages)

1. `supabase-config.js`에 publishable key만 있는지 확인한다. `service_role` 금지.
2. [`../tests/release/web-app.md`](../tests/release/web-app.md)를 체크한다.
3. `main`을 push하면 Pages가 갱신된다 (저장소 Pages 설정이 `main` 루트일 때).
4. https://donggrri.github.io/moa/ 에서 로그인·공간·할일 한 건을 확인한다.

## MCP (이 PC)

1. `mcp-server/.env`는 로컬에만 둔다.
2. 저장소 루트에서 `npm --prefix mcp-server run http:start` 또는 로그온 작업으로 서버를 띄운다.
3. 실서버 필수 릴리즈 테스트를 실행한다 (Strict 모드: 서버 미가동 시 실패).

```powershell
npm run test:release
```

4. [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md)를 체크한다.
5. Cursor를 재시작한 뒤 공간 목록·할일 조회를 한 번 한다.

파이로 옮긴 뒤에는 같은 체크리스트의 URL만 터널 주소로 바꾼다.

## 통과 기준

- `npm test` 통과 (오프라인 단위·계약)
- MCP 릴리즈 시 `npm run test:release` 통과 (실서버 필수 검증)
- 해당 `tests/release/*.md` 필수 항목 전부 체크
- `FEATURES.md`에 이번 릴리즈 기능이 `shipped` 또는 명시적 `in_progress`
