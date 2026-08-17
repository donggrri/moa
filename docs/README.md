# 문서 지도

이후 작업은 이 표를 먼저 보고 파일을 고칩니다. 한 일에 여러 파일이 해당하면 모두 고칩니다.

| 상황 | 고칠 문서 | 하지 않는 것 |
|---|---|---|
| 다음에 이어서 할 일이 바뀜 | [`CONTINUE.md`](CONTINUE.md), [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md)의 **다음 작업 순서** | 완료된 기능을 계획서 본문에 길게 남기지 않음 |
| 기능이 코드로 끝남 | [`FEATURES.md`](FEATURES.md) 상태를 `shipped`로, [`../tests/`](../tests/)에 자동 또는 릴리즈 테스트, 사용자 화면이면 [`RELEASE.md`](RELEASE.md) | `PROJECT_PLAN.md`에서 해당 줄을 지우기만 하고 기능 대장에 안 적기 |
| 릴리즈·GitHub Pages 배포 | [`RELEASE.md`](RELEASE.md), [`../tests/release/`](../tests/release/) 체크리스트 수행 | 비밀 값을 README에 적기 |
| 사용자가 쓰는 방법 | [`../README.md`](../README.md), 해당 하위 README (`mcp-server/`, `supabase/`) | 계획 검토 문장만 고치고 사용법을 안 고침 |
| MCP·서버 운영 | [`../mcp-server/README.md`](../mcp-server/README.md), [`CONTINUE.md`](CONTINUE.md) | `service_role`을 클라이언트 설정 예시에 넣기 |
| 도메인 용어 | [`../CONTEXT.md`](../CONTEXT.md) | 같은 뜻을 문서마다 다른 말로 쓰기 |
| 스키마·RPC | [`../supabase/README.md`](../supabase/README.md), `mcp-server/README.md` 계약 절 | 웹과 MCP가 다른 컬럼명을 쓰게 두기 |

## 역할

- **README.md**: 지금 쓰는 방법. 짧은 현재 상태만 둔다.
- **PROJECT_PLAN.md**: 제품 방향과 **아직 안 한 일**. 완료 목록의 원본이 아니다.
- **FEATURES.md**: 기능의 상태 원본 (`shipped` / `in_progress` / `next` / `parked`).
- **CONTINUE.md**: 다음 세션에서 바로 이어서 할 손 위치.
- **RELEASE.md**: 배포 전에 돌릴 테스트와 절차.
- **CONTEXT.md**: 용어. 기능 완료 여부는 적지 않는다.

에이전트는 `.cursor/rules/docs.mdc`도 이 표를 따른다.
