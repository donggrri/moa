# 모아 MCP 서버

`mcp-server/`는 모아의 Supabase 데이터를 Codex 같은 MCP 클라이언트에서 사용할 수 있게 하는 로컬 STDIO 서버입니다.

이 서버는 임의 SQL 실행 도구를 제공하지 않습니다. 정해진 8개 도구만 노출하고, 모든 요청을 `MOA_MCP_USER_ID`와 공간 membership으로 제한합니다. `MOA_SUPABASE_SERVICE_ROLE_KEY`는 이 Node.js 프로세스에서만 읽으며 MCP 응답, 표준 출력, 문서에 기록하지 않습니다.

## 포함 파일

- `server.mjs`: 의존성 없는 Node.js MCP STDIO 서버와 Supabase REST/RPC 어댑터
- `package.json`: Node.js 실행 스크립트와 엔진 조건

별도 패키지 설치가 필요하지 않습니다. Node.js 18 이상에 포함된 `fetch`를 사용합니다.

## 환경변수

실행하는 컴퓨터에서 다음 세 값을 설정합니다.

```powershell
$env:MOA_SUPABASE_URL = "https://your-project.supabase.co"
$env:MOA_SUPABASE_SERVICE_ROLE_KEY = "서버에서만 보관할 service_role 키"
$env:MOA_MCP_USER_ID = "00000000-0000-0000-0000-000000000000"
```

`MOA_MCP_USER_ID`는 Supabase Auth 사용자의 UUID입니다. 이 값을 고정된 MCP 사용자 ID로 사용하므로, 한 로컬 MCP 프로세스는 해당 사용자 권한으로 동작합니다.

## 실행

```powershell
cd C:\path\to\Note\mcp-server
$env:MOA_SUPABASE_URL = "https://your-project.supabase.co"
$env:MOA_SUPABASE_SERVICE_ROLE_KEY = "(터미널 세션에서만 설정)"
$env:MOA_MCP_USER_ID = "your-auth-user-uuid"
node .\server.mjs
```

이 서버는 표준 입력으로 줄바꿈 단위 JSON-RPC를 받고 표준 출력으로 MCP 응답만 보냅니다. 진단 로그는 표준 오류로만 보냅니다. 따라서 MCP 클라이언트 설정의 `command`는 `node`, `args`는 이 디렉터리의 `server.mjs`를 가리키고, 세 환경변수를 해당 프로세스에만 전달해야 합니다.

예시:

```json
{
  "mcpServers": {
    "moa": {
      "command": "node",
      "args": ["C:\\path\\to\\Note\\mcp-server\\server.mjs"],
      "env": {
        "MOA_SUPABASE_URL": "https://your-project.supabase.co",
        "MOA_SUPABASE_SERVICE_ROLE_KEY": "${MOA_SUPABASE_SERVICE_ROLE_KEY}",
        "MOA_MCP_USER_ID": "your-auth-user-uuid"
      }
    }
  }
}
```

실제 MCP 클라이언트의 설정 파일 위치와 환경변수 치환 문법은 클라이언트 문서를 따릅니다. 키를 이 JSON 파일에 직접 커밋하지 마세요.

## 노출 도구

| 도구 | 입력 | 동작 |
| --- | --- | --- |
| `list_spaces` | 없음 | 현재 사용자가 membership을 가진 공간만 조회 |
| `get_today_tasks` | `space_id` | 해당 공간의 로컬 프로세스 기준 오늘 할일 조회 |
| `add_task` | `space_id`, `title`, `due_date`, 선택적 시간·담당자·분류·메모·`recurrence` | 할일 추가 |
| `complete_task` | `space_id`, `task_id` | 할일 완료 및 반복 다음 회차 생성 |
| `postpone_task` | `space_id`, `task_id` | 미완료 할일 하루 연기 |
| `list_ideas` | `space_id`, 선택적 `include_archived` | 아이디어 조회 |
| `add_idea` | `space_id`, `title`, 선택적 `body` | 아이디어 추가 |
| `convert_idea_to_task` | `space_id`, `idea_id`, `due_date`, 선택적 시간·담당자·분류·메모 | 아이디어를 할일로 원자적 전환 |

모든 UUID는 표준 UUID 형식이어야 합니다. 제목·메모·본문 길이, 날짜(`YYYY-MM-DD`), 시간(`HH:MM[:SS]`), 추가 필드를 서버에서 다시 검증합니다. 지원하지 않는 필드는 거부합니다.

## Supabase 스키마 계약

웹 앱과 동일한 Supabase 프로젝트에 아래 테이블과 컬럼이 있어야 합니다. 컬럼명은 현재 서버가 요청하는 이름이며, 실제 스키마가 다르면 migration 또는 서버 계약을 함께 변경해야 합니다.

### 테이블

- `spaces`: `id uuid`, `name text`, `type text`, `timezone text`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`
- `memberships`: `user_id uuid`, `space_id uuid`, `role text`, `status text`, `created_at timestamptz`
- `tasks`: `id uuid`, `space_id uuid`, `title text`, `due_date date`, `due_time time`, `assignee_id uuid`, `category text`, `note text`, `status text`, `completed_at timestamptz`, `postponed_at timestamptz`, `recurrence_rule_id uuid`, `source_idea_id uuid`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`
- `ideas`: `id uuid`, `space_id uuid`, `title text`, `body text`, `status text`, `converted_task_id uuid`, `author_id uuid`, `created_at timestamptz`, `updated_at timestamptz`
- 반복 일정이 있다면 `recurrence_rules`와 `tasks.recurrence_rule_id`를 연결합니다.

`memberships(user_id, space_id)`에는 중복을 막는 unique 제약을 권장합니다. 반복 다음 회차 중복을 막기 위해서는 반복 규칙과 예정일을 식별하는 unique 제약 또는 동등한 DB 보장이 필요합니다.

### RPC 함수

쓰기 작업은 아래 이름의 Supabase RPC를 사용합니다. PostgREST body 키도 아래 이름 그대로 구현해야 합니다. 서버는 RPC가 없거나 함수 이름·인자가 다른 경우 임의의 다른 함수를 시도하지 않고 안전한 계약 오류를 반환합니다.

#### `create_task`

```text
create_task(
  p_space_id uuid,
  p_title text,
  p_due_date date,
  p_due_time time default null,
  p_assignee_id uuid default null,
  p_category text default '기타',
  p_note text default null,
  p_frequency text default 'none',
  p_actor_user_id uuid default null
) returns tasks
```

`p_frequency`는 `none`, `daily`, `weekdays`, `weekly`, `monthly` 중 하나입니다.

#### `complete_task`

```text
complete_task(
  p_task_id uuid,
  p_completed boolean default true,
  p_actor_user_id uuid default null
) returns tasks
```

함수 내부에서 사용자가 해당 공간의 membership인지, 할일이 해당 공간 소속인지 재확인해야 합니다. 이미 완료된 반복 할일을 동시에 두 번 완료해도 다음 회차가 하나만 만들어지도록 원자적으로 처리해야 합니다.

#### `postpone_task`

```text
postpone_task(
  p_task_id uuid,
  p_actor_user_id uuid default null
) returns tasks
```

함수 내부에서 미완료 여부를 확인하고 `max(current due_date, current_date) + 1 day`로 `due_date`를 변경하며 `postponed_at`을 기록해야 합니다.

아이디어 추가는 활성 membership 확인 후 `ideas` 테이블에 `author_id = MOA_MCP_USER_ID`로 직접 insert합니다.

#### `convert_idea_to_task`

```text
convert_idea_to_task(
  p_idea_id uuid,
  p_due_date date default current_date,
  p_due_time time default null,
  p_assignee_id uuid default null,
  p_category text default '기타',
  p_note text default null,
  p_frequency text default 'none',
  p_actor_user_id uuid default null
) returns tasks
```

함수는 membership, 아이디어의 공간 소속, 담당자의 공간 소속을 확인한 뒤 할일을 만들고 원본 아이디어의 `status`와 `converted_task_id`를 한 트랜잭션에서 갱신해야 합니다.

`p_actor_user_id`는 MCP 서버가 service role 요청에서만 전달하는 내부 인자입니다. 웹 브라우저는 전달하지 않으며, SQL은 일반 사용자 JWT의 `auth.uid()`를 항상 우선합니다.

계획에 포함된 `join_space(p_invite_code text)` 계약은 웹 초대 흐름을 위한 계약이며 현재 MCP 도구로 노출하지 않습니다.

## 권한과 오류 처리

1. `list_spaces`는 `memberships.user_id = MOA_MCP_USER_ID`로 먼저 목록을 만들고 그 결과의 `space_id`만 조회합니다.
2. 공간을 받는 모든 도구는 해당 사용자의 membership을 별도 조회합니다.
3. 할일 완료·연기·아이디어 전환은 리소스가 요청한 `space_id`에 실제로 속하는지 추가 조회합니다.
4. 담당자가 지정되면 담당자도 같은 공간의 멤버인지 확인합니다.
5. RPC 함수도 같은 권한 검사를 수행해야 합니다. `service_role`은 RLS를 우회하므로 애플리케이션 검사와 RPC 검사가 모두 필요합니다.
6. 입력 오류·권한 오류·계약 오류는 사용자에게 안전한 메시지만 반환합니다. Supabase 응답 본문, URL, 키, 스택 트레이스는 MCP 응답에 넣지 않습니다.

`service_role` 키는 브라우저 웹 앱, GitHub Pages 정적 파일, Git 저장소, MCP 응답에 절대 넣지 마세요. 이 서버는 로컬 프로세스에서만 사용하도록 설계되어 있으며, 원격 HTTP 공개 서버로 전환할 때는 별도 사용자 인증과 토큰별 공간 권한 모델이 필요합니다.

## 구현 범위 밖

- Supabase migration을 자동 실행하지 않습니다.
- 웹 앱의 `localStorage`를 이전하지 않습니다.
- MCP를 HTTP로 공개하지 않습니다.
- 임의 SQL, 임의 REST 테이블 경로, membership 변경, 초대 생성·참여 도구를 노출하지 않습니다.
