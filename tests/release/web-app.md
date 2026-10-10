# 릴리즈 테스트 — 웹 앱

대상: GitHub Pages https://donggrri.github.io/moa/ 와 로컬 `http://localhost:5173/`

자동 웹 E2E는 없다. 로직은 `npm test`, 정적 자산은 `npm run test:web`. 배포 전에 이 목록을 손으로 한다.

이 목록의 로그인은 **이메일**이다. 카카오 실로그인·초대+카카오·Pages 카카오는 [`web-kakao.md`](web-kakao.md)다.

## 필수

- [ ] 설정 안내 화면이 나오지 않음 (publishable key 연결됨)
- [ ] 이메일 로그인 성공
- [ ] 공동 공간 목록이 보임
- [ ] 할일 추가 후 새로고침해도 남음 (Supabase)
- [ ] 완료·연기가 동작
- [ ] 날짜가 지난 미완료 할일이 목록에서 사라지지 않음
- [ ] 오늘 화면에 당일 할일과 지연 할일이 함께 보임 (지난 완료·미래 할일은 없음)
- [ ] `service_role`이 브라우저 소스·`supabase-config.js`에 없음

## 가능하면

- [ ] 두 번째 계정 초대 참여
- [ ] 같은 공간 할일이 두 브라우저에 보임
- [ ] 비밀번호 재설정 메일이 도착

## 회사 PC

- [ ] Node 없이 Pages URL만으로 로그인 (이메일 또는 카카오)
- [ ] 집 계정과 같은 공간이 보임

카카오로 회사 PC를 확인하면 [`web-kakao.md`](web-kakao.md) Pages 절도 같이 체크한다.
