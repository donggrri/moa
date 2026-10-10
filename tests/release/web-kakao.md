# 릴리즈 테스트 — 카카오 로그인

대상: 로컬 `http://localhost:5173/` 와 GitHub Pages https://donggrri.github.io/moa/

자동 게이트는 카카오 계정·Client Secret·동의 화면을 쓰지 않는다. CI가 막는 것은 초대/OAuth URL 로직과 번들에 카카오 버튼이 들어 있는지만이다.

```powershell
npm test
npm run test:web
```

실로그인은 이 목록이다. 설정 방법은 [`../../supabase/README.md`](../../supabase/README.md)의 카카오 로그인 절.

## 이 목록을 하기 전

- [ ] `supabase/migrations/002_kakao_profile_name.sql`을 SQL Editor에서 실행함
- [ ] Kakao Developers 앱에서 카카오 로그인이 켜져 있음
- [ ] Kakao Redirect URI가 `https://rhobkvxtyscwfceiowpx.supabase.co/auth/v1/callback` (앱 주소가 아님)
- [ ] Supabase Authentication → Providers → Kakao가 켜져 있고 Client ID·Client Secret이 들어 있음
- [ ] 동의 항목 `profile_nickname`, `profile_image`가 켜져 있음
- [ ] 비즈 앱에서 `account_email`을 켰거나, 이메일을 안 받으면 **Allow users without an email**을 켰음
- [ ] Supabase Redirect URL에 `http://localhost:5173/` 와 `https://donggrri.github.io/moa/` 가 있음
- [ ] 카카오 Web 사이트 도메인에 `http://localhost:5173` 과 `https://donggrri.github.io` 가 있음

설정이 비어 있으면 버튼을 눌러도 카카오 동의 화면으로 가지 않는다. 그때는 이 목록을 비우지 말고 설정을 먼저 고친다.

## 필수 (로컬)

- [ ] `node server.mjs` 후 로그인 화면에 노란 **카카오 로그인** 버튼이 보임
- [ ] 버튼을 누르면 카카오 동의 화면으로 감
- [ ] 동의 후 모아로 돌아와 공동 공간 목록이 보임
- [ ] 사이드바에 카카오 닉네임이 보임
- [ ] 새로고침해도 로그인이 유지됨
- [ ] 로그아웃 후 같은 카카오 계정으로 다시 들어오면 같은 사용자임
- [ ] **비밀번호를 잊었어요** 화면에는 카카오 버튼이 없음
- [ ] 이메일 로그인이 여전히 됨

## 필수 (초대)

- [ ] 이미 로그인한 계정에서 초대 링크를 복사함
- [ ] 시크릿 창(또는 다른 브라우저)에서 그 링크를 열고 **카카오 로그인**으로 다른 카카오 계정에 들어감
- [ ] 초대한 공동 공간에 참여되어 있음

## 필수 (Pages) — 배포 후

- [ ] https://donggrri.github.io/moa/ 에서 카카오 로그인이 됨
- [ ] 회사 PC에서 Node 없이 Pages URL만으로 카카오 로그인됨
- [ ] 집 계정과 같은 공간이 보임

## 가능하면

- [ ] 카카오 동의 화면에서 취소하면 모아 로그인 화면에 안내가 보임
- [ ] 카카오로 만든 계정으로 할일 추가 후 새로고침해도 남음

## 실패하면

| 증상 | 볼 곳 |
|---|---|
| 버튼은 있는데 카카오로 안 감 | Supabase Providers → Kakao가 꺼져 있거나 Client ID/Secret이 비어 있음 |
| KOE205 / 동의 항목 오류 | 비즈 앱이 아니거나 `account_email`이 꺼져 있음 |
| 카카오 후 다시 로그인 화면 | Redirect URI가 Supabase 콜백이 아님. `localhost`나 Pages 주소를 Kakao Redirect URI에 넣으면 안 됨 |
| 로컬은 되고 Pages만 실패 | Redirect URL 또는 카카오 Web 도메인에 Pages 주소 누락 |
| 로그인은 되는데 이름이 “모아 사용자” | `002_kakao_profile_name.sql` 미실행 |

이메일·할일·지연 화면 등 나머지 웹 확인은 [`web-app.md`](web-app.md)다.
