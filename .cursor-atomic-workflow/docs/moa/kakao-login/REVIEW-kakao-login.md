# REVIEW: moa 카카오 로그인 마무리

상태: Phase 4
슬러그: kakao-login
기준: cursor/kakao-login-baf8

## Standards

- 기존 IIFE·vanilla JS 패턴 유지. `auth-flow.js`는 순수 함수 + export.
- 비밀 미포함. setup 문구만 migration 경로 갱신.

## Spec (PLAN/TASKS)

| 항목 | 결과 |
|---|---|
| OAuth URL에서 PKCE code/state 제거 (invite 유지) | `stripOAuthCallbackParams` + `scrubOAuthCallbackFromUrl` after session |
| 카카오 복귀 로딩 문구 | `authBootMarkup` + `hasAuthCallbackParams` |
| 닉네임 폴백 | `getCurrentUser` when profile still `모아 사용자` |
| 테스트 | `auth-flow.test.mjs` 신규 케이스; `npm test`, `npm run test:web` |

## 테스트

- `npm test` — pass
- `npm run test:web` — pass
- mutation: stryker 설정 있으나 이번 diff는 소규모; 수동 검토로 충분

## 남은 운영 작업 (코드 밖)

- SQL Editor: `002_kakao_profile_name.sql` (live DB 미적용 시)
- Kakao Developers + Supabase Kakao provider (PR 체크리스트)

## 결함

없음.
