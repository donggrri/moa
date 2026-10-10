# EXPLORE: moa 카카오 로그인

상태: Phase 0
슬러그: kakao-login
기준: d6f7f9912f237f3825d6fa4aa7226071f93431e6

## 한 줄 요약

카카오 로그인의 핵심(버튼·OAuth·초대 유지·에러·테스트·운영 문서)은 이미 `1202c1e`에 들어 있다. 남은 갭은 OAuth 복귀 URL 정리·콜백 로딩 UX·DB 닉네임 없을 때 auth metadata 폴백·설정 화면 migration 안내, 그리고 live DB에 `002_kakao_profile_name.sql` 미적용(운영 작업).

## 분석 대상 파일 및 디렉터리

1. `auth-flow.js` — 초대/OAuth URL·에러 파싱·`displayNameFromUser`. `hasAuthCallbackParams`는 테스트만 있고 `app.js`에서 미사용.
2. `app.js` — `signInWithOAuth({ provider: 'kakao' })`, `consumeAuthCallbackError`, `onAuthStateChange` + `getSession`, 로그아웃. OAuth `code` 쿼리는 초대 코드만 제거하고 PKCE `code`는 URL에 남을 수 있음.
3. `supabase-client.js` — `detectSessionInUrl: true`, 세션 persist.
4. `supabase/migrations/002_kakao_profile_name.sql` — `handle_new_user` 닉네임 coalesce (001에도 유사 로직 있음; 재실행 안전).
5. `supabase/README.md`, `tests/release/web-kakao.md` — Kakao Developers·Supabase Provider·Redirect URL 체크리스트.
6. `tests/web/auth-flow.test.mjs`, `tests/release/web-static.test.mjs` — 자동 게이트.

## 아키텍처 및 흐름

브라우저 → `signInWithOAuth(kakao)` → Kakao 동의 → Supabase `/auth/v1/callback` → 앱 `redirectTo`(origin+path, optional `invite`) → Supabase JS가 URL의 code를 세션으로 교환 → `onAuthStateChange` / `getSession` → `data-store` RPC로 공간 로드. 프로필 이름은 `auth.users` insert 트리거 `handle_new_user` → `profiles.display_name`.

## 제약 사항 및 리스크

- Client Secret·REST 키는 Supabase Dashboard만; CI는 실 OAuth 불가.
- GitHub Pages는 Supabase Redirect URL에 `https://donggrri.github.io/moa/` 등록 필요.
- 카카오 Redirect URI는 **앱 URL이 아니라** Supabase callback만.
- `account_email`은 비즈 앱 또는 Allow users without an email.

## PLAN을 위한 권장 사항

1. `stripOAuthCallbackParams` 추가 후 성공 로그인 시 history.replaceState로 code/state 제거 (invite 유지).
2. `hasAuthCallbackParams`로 복귀 시 로딩 문구 구분.
3. `getCurrentUser`에서 profiles가 `모아 사용자`일 때 `displayNameFromUser` 폴백.
4. `configInstructions` migration 목록에 `002_kakao_profile_name.sql` 명시.
5. workflow 문서 커밋; FEATURES는 이미 shipped — PR에 외부 설정 체크리스트만 강화.
