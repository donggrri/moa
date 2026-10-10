# PLAN: moa 카카오 로그인 마무리

상태: Phase 1
슬러그: kakao-login
워크트리: (없음) — `cursor/kakao-login-baf8`
브랜치: cursor/kakao-login-baf8
기준: d6f7f9912f237f3825d6fa4aa7226071f93431e6

## 한 줄 목표

이미 구현된 Supabase Kakao OAuth 흐름의 UX·URL·닉네임 폴백을 완성하고, atomic workflow 산출물과 PR 외부 설정 체크리스트로 운영 연결을 명확히 한다.

## 계획 정제

- route: bounded
- skills: codebase-design, domain-modeling
- decision rounds: 0 (기존 아키텍처 유지)
- settled decisions: 카카오 토큰은 Supabase가 처리; 프론트는 publishable key만; 실로그인은 `web-kakao.md` 수동.
- remaining fog: 없음

## 하지 않을 것

- 카카오톡 메시지/공유 API
- 서버 사이드 자체 OAuth (Supabase provider 유지)
- 비밀값·service_role 커밋
- live DB migration 자동 적용

## 막힌 질문

없음.

## 의존 순서

1. `auth-flow.js` URL 정리 헬퍼 + 테스트
2. `app.js` 콜백 UX·URL 정리·닉네임 폴백·설정 문구
3. workflow REVIEW 및 `npm test` / `npm run test:web`
4. 문서·PR 체크리스트

## 설계

- `stripOAuthCallbackParams(href)`: 비초대 `code`, `state`, OAuth error 키, legacy hash token 제거. `invite` 유지.
- 성공 `startAuthenticatedSession` 종료 시 `replaceState`.
- `authCallbackLoadingMessage()`: `hasAuthCallbackParams`면 카카오 마무리 문구.
- `getCurrentUser`: member.name이 기본값이면 auth metadata 이름 사용.

## 검증

- 자동: `npm test`, `npm run test:web`
- 수동: `tests/release/web-kakao.md` (Provider·migration·Pages)

## 문서

- PR body: Kakao Developers + Supabase 설정 단계
- `supabase/README.md`는 기존 절 유지; PR에서 migration 적용 강조
