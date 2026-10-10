# cursor-atomic-workflow 작업 홈 (moa)

이 디렉터리는 [cursor-atomic-workflow](https://github.com/donggrri/cursor-atomic-workflow)가 쓰는 **작업 홈**입니다. 에이전트는 `CURSOR_ATOMIC_WORKFLOW_HOME`을 이 경로(저장소 루트 기준 `.cursor-atomic-workflow`)로 두고 PLAN/TASKS/REVIEW를 만듭니다.

| 하위 경로 | 내용 |
|---|---|
| `docs/moa/<slug>/` | EXPLORE·PLAN·TASKS·REVIEW·STATUS.json (필요 시 커밋) |
| `runs/moa/<slug>/` | pipeline.log, pipeline.json 등 (gitignore) |
| `evidence/` | 실행 증거 (gitignore) |

설치·슬래시 커맨드: `docs/ATOMIC_WORKFLOW.md`
