# Cursor atomic workflow (moa)

moa는 [cursor-atomic-workflow](https://github.com/donggrri/cursor-atomic-workflow) (`main`)를 써서 **explore → plan → task → execute → review → wrapup** 단계를 맞춥니다. 슬래시 커맨드는 Cursor 채팅에서 `/cursor-atomic-plan` 등으로 호출합니다.

## 설치된 것

| 위치 | 내용 |
|---|---|
| `.cursor/skills/cursor-atomic-*` 등 | 슬래시 커맨드·업스트림 스킬 (grilling, tdd, …) |
| `.cursor/agents/*.md` | explorer, planner, worker, reviewer 등 서브에이전트 |
| `.cursor-atomic-workflow.json` | 프로필 `moa`, agy 기본값 |
| `profiles/moa.json` | 테스트 완료 기준 `npm test` |
| `.cursor/rules/atomic-workflow.mdc` | 작업 홈 환경 변수 안내 |

`.cursor/mcp.json`(moa MCP)과 `docs.mdc` 문서 규칙은 그대로입니다.

## 작업 홈 (Cloud Agent·로컬 공통)

기본값 `~/.cursor-atomic-workflow`는 Cloud Agent VM마다 사라집니다. moa는 저장소 안에 고정합니다.

```bash
export CURSOR_ATOMIC_WORKFLOW_HOME="$(git rev-parse --show-toplevel)/.cursor-atomic-workflow"
```

산출물 예: `.cursor-atomic-workflow/docs/moa/<slug>/PLAN-<slug>.md`  
런 로그는 `.cursor-atomic-workflow/runs/` 아래이며 git에 넣지 않습니다.

## 자주 쓰는 커맨드

| 커맨드 | 용도 |
|---|---|
| `/cursor-atomic-explore` | (선택) 코드·도메인 탐색 |
| `/cursor-atomic-plan` | PLAN 작성 후 파이프라인 진입 |
| `/cursor-atomic-wrapup` | 커밋·마무리 (push는 하지 않음) |
| `/cursor-atomic-status` | 진행 상태 |
| `/cursor-atomic-doctor` | 스킬 충돌·설치 상태 점검 |

PLAN만 쓰려면 `/cursor-atomic-plan 계획만`을 사용합니다.

## 재설치·업그레이드

패키지를 클론한 뒤:

```bash
git clone --depth 1 https://github.com/donggrri/cursor-atomic-workflow.git /tmp/cursor-atomic-workflow
node /tmp/cursor-atomic-workflow/scripts/install.mjs --target "$(git rev-parse --show-toplevel)" --force
```

`--force`는 기존 `.cursor/skills`·`.cursor/agents`의 워크플로 파일을 덮어씁니다. moa 전용 설정(`.cursor-atomic-workflow.json`, `profiles/moa.json`, 규칙·이 문서)은 별도로 유지합니다.

## moa 문서와 함께

기능이 끝나면 워크플로 REVIEW와 별도로 `docs/FEATURES.md`, `docs/CONTINUE.md`, `PROJECT_PLAN.md`를 `docs/README.md`·`docs.mdc`에 맞게 갱신합니다.
