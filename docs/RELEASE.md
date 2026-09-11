# 릴리즈 프로세스

GitHub Pages 배포는 GitHub Actions의 테스트 게이트를 통과한 경우에만 진행한다. MCP HTTP는 Pages에 배포하지 않으며, 로컬 PC에서 별도 운영한다.

## 릴리즈 계약

`main`에 push하거나 Actions에서 수동 실행하면 `.github/workflows/release.yml`이 다음 순서로 실행된다.

```text
Test gate → Build Pages artifact → Deploy Pages
```

`Test gate`가 실패하거나 중단되면 `Build Pages artifact`와 `Deploy Pages`는 실행되지 않는다. 따라서 Pages 배포를 우회하려면 저장소 설정에서 직접 배포하는 경로를 함께 차단해야 한다.

## 저장소 최초 설정

GitHub 저장소에서 다음을 한 번 설정한다.

1. Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 변경한다.
2. `main` 브랜치 보호 규칙을 만들고 `Release / Test gate`를 필수 상태 검사로 지정한다.
3. `main` 직접 push를 제한하고 Pull Request를 통해서만 병합한다.
4. `github-pages` Environment가 `main`에서만 배포되도록 보호한다.

Pages가 `main` 브랜치 루트를 직접 배포하도록 남아 있으면 Actions를 거치지 않고 배포될 수 있으므로, 1번 설정은 필수다.

## 자동 테스트 게이트

CI는 매 Pull Request와 `main` push에서 다음을 실행한다.

| 단계 | 명령 | 목적 |
|---|---|---|
| 문법 | `node --check ...` (`app.js`, `auth-flow.js` 포함) | JavaScript 구문 오류 차단 |
| MCP 계약 | `npm test` | MCP 입력·권한·JSON-RPC 계약 검증 |
| 웹 정적 smoke | `npm run test:web` | 실제 정적 서버와 Pages 자산 검증 |
| MCP HTTP smoke | `MOA_MCP_REQUIRE_LIVE=1 npm run test:release` | health, bearer 인증, 실제 HTTP 경로 검증. 서버가 없으면 skip이 아니라 실패 |
| mutation | `npm run test:mutate` | `mcp-server/**/*.mjs` 변경이 있는 `main` 릴리즈 후보의 MCP 회귀 검증 |

Mutation 테스트는 MCP 구현 변경이 있는 `main` 릴리즈 후보에서 실행한다. 현재 breaking threshold는 50%이며, 실패하면 Pages 배포도 실행되지 않는다. mutation 대상은 결정론적인 MCP core 범위이며, 실제 HTTP listener·request body stream·프로세스 bootstrap은 `npm test`의 HTTP 통합 테스트와 release smoke가 검증한다. 웹 전용 변경에서는 MCP mutation을 중복 실행하지 않는다.

CI의 MCP 서버는 테스트용 Supabase 설정으로 기동하며, health와 인증 실패 경로만 호출한다. 운영 Supabase, 운영 토큰, 개인 계정은 사용하지 않는다.

## 개발자 로컬 확인

```powershell
npm ci
npm test
npm run test:web

# MCP 서버를 별도로 실행한 뒤
$env:MOA_MCP_REQUIRE_LIVE = "1"
npm run test:release

# 릴리즈 후보에서
npm run test:mutate
```

`MOA_MCP_REQUIRE_LIVE`를 지정하지 않은 `npm run test:release`는 개발 편의를 위해 MCP 서버가 없을 때 skip할 수 있다. CI에서는 워크플로가 이 값을 반드시 지정한다.

## Pages 배포 흐름

1. 기능 변경을 Pull Request로 올린다.
2. `Release / Test gate`가 모두 성공해야 `main`에 병합한다.
3. `main` 병합 후 동일한 테스트 게이트가 다시 실행된다.
4. 테스트 성공 후에만 Pages artifact를 만들고 배포한다.
5. 배포 URL은 Actions의 `github-pages` Environment에서 확인한다.

웹 사용자 확인은 [`../tests/release/web-app.md`](../tests/release/web-app.md)를 따른다. 로그인·Supabase 데이터·두 사용자 Realtime 동작은 운영 계정과 외부 서비스가 필요하므로 자동 게이트와 별도의 운영 확인으로 남긴다.

## MCP PC 릴리즈

Pages 배포와 독립적으로 다음을 수행한다.

1. `mcp-server/.env`는 로컬에만 둔다.
2. `npm run http:start` 또는 로그온 작업으로 서버를 실행한다.
3. [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md)의 필수 항목을 확인한다.
4. Cursor 재시작 후 `list_spaces`와 `list_tasks`를 호출한다.

## 실패와 롤백

- 테스트 실패: 배포하지 않고 로그와 artifact를 확인한 뒤 수정한다.
- Pages 실패: 마지막 정상 커밋으로 workflow를 재실행하거나 마지막 정상 정적 artifact를 재배포한다.
- MCP 실패: 이전 서버 버전과 설정으로 복구한 뒤 health와 bearer 테스트를 다시 실행한다.
- DB/RLS 실패: 애플리케이션만 무조건 되돌리지 말고, 호환 가능한 forward-repair migration을 우선한다.

## 릴리즈 통과 기준

- `Release / Test gate` 성공
- 필수 테스트에 skip 없음
- `main` 보호 규칙과 Pages Source가 위 설정을 따름
- 필요한 경우 [`../tests/release/web-app.md`](../tests/release/web-app.md)와 [`../tests/release/mcp-http.md`](../tests/release/mcp-http.md)의 운영 확인 완료
- `docs/FEATURES.md`의 기능 상태가 `shipped` 또는 명시적인 `in_progress`
