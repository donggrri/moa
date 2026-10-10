# 모아 MCP 서버

`mcp-server/`는 모아의 Supabase 데이터를 Cursor·Codex·OpenCode 같은 MCP 클라이언트에서 쓰게 하는 서버입니다. 임의 SQL은 없고, 정해진 도구만 노출합니다.

세 경로는 **같은 DB**를 보지만 서로 거치지 않습니다.

- **웹**: GitHub Pages 또는 `localhost:5173` → publishable key + 이메일 로그인. MCP 없이 동작합니다. Pages는 MCP를 호스팅하지 않습니다.
- **HTTP (현재 기본)**: 이 PC가 서버, Cursor가 클라이언트입니다. PC가 켜져 있고 `node server.mjs --http`가 떠 있을 때만 처리합니다. 클라이언트는 URL + Bearer만 보내고, `service_role`은 서버에만 둡니다.
- **로컬 STDIO (대안)**: Cursor가 이 PC에서 `node server.mjs`를 자식 프로세스로 실행합니다. `.env`의 `MOA_MCP_USER_ID` 한 사람으로 고정됩니다.
- **이후**: 같은 HTTP 서버를 라즈베리파이에서 systemd로 띄우고, 회사 PC는 Cloudflare Tunnel URL로 붙입니다.

`MOA_SUPABASE_SERVICE_ROLE_KEY`는 이 Node 프로세스에서만 읽으며 MCP 응답·표준 출력·GitHub에 기록하지 않습니다. 클라이언트에 Supabase JWT를 넣어 DB로 다시 전달하지 않습니다.

## 포함 파일

- `server.mjs`: STDIO와 `POST /mcp` HTTP, Supabase REST/RPC 어댑터
- 단위 테스트: 저장소 `tests/mcp/server.test.mjs` (`npm test`, DB 없이 지금 가능). mutation은 저장소 루트 `npx stryker run --mutate mcp-server/server.mjs`. 실서버·Cursor/Grok 조회는 **나중에** `tests/release/mcp-http.md` (`MCP-PC-RUN`)
- `.env.example`: 로컬 비밀 값 템플릿. 실제 값은 `.env`에만 둡니다
- `package.json`: Node.js 실행 스크립트와 엔진 조건
- `scripts/start-http.ps1`: 이 PC에서 HTTP 서버가 꺼져 있으면 시작
- `scripts/install-startup.ps1`: Windows 로그온 시 서버 자동 시작
- `scripts/uninstall-startup.ps1`: 자동 시작 해제
- `scripts/moa-mcp-http.service`: 이후 라즈베리파이용 systemd 유닛 예시

별도 패키지 설치가 필요하지 않습니다. Node.js 18 이상에 포함된 `fetch`를 사용합니다.

## 환경변수

`mcp-server/.env`에 넣으면 서버가 시작 시 읽습니다. 이미 있는 환경변수는 덮어쓰지 않습니다.

HTTP(현재 기본). `MOA_MCP_USER_ID`는 쓰지 않고, 토큰마다 사용자를 정합니다.

```powershell
$env:MOA_SUPABASE_URL = "https://your-project.supabase.co"
$env:MOA_SUPABASE_SERVICE_ROLE_KEY = "서버에서만 보관할 service_role 키"
$env:MOA_MCP_TOKENS = "16자이상토큰:auth-user-uuid"
$env:MOA_MCP_HTTP_HOST = "127.0.0.1"
$env:MOA_MCP_HTTP_PORT = "8787"
```

여러 사용자는 쉼표로 나눕니다. `tokenA:uuid-a,tokenB:uuid-b`

`MOA_MCP_HTTP_ORIGINS`를 넣으면 그 Origin만 브라우저 요청을 받습니다. Cursor 같은 네이티브 클라이언트는 Origin이 없으면 통과합니다.

STDIO 대안:

```powershell
$env:MOA_MCP_USER_ID = "00000000-0000-0000-0000-000000000000"
```

## 실행

지금 단계는 **이 PC가 켜져 있을 때만** HTTP 서버가 요청을 처리합니다. GitHub Pages에는 올리지 않습니다. HTTP는 인증 없이 `0.0.0.0`에 열지 마세요.

한 번만 등록 (로그온 시 자동 시작):

```powershell
cd C:\Users\tlsfmswls\Desktop\Note\mcp-server
npm run http:install
```

지금 바로 켜기:

```powershell
npm run http:start
```

또는 포그라운드:

```powershell
node .\server.mjs --http
```

정상 여부: `http://127.0.0.1:8787/health` → `{"ok":true}`

자동 시작 해제:

```powershell
npm run http:uninstall
```

STDIO 대안:

```powershell
node .\server.mjs
```

## Cursor / Codex / OpenCode

이 레포의 `.cursor/mcp.json`은 HTTP 클라이언트입니다. 서버가 `127.0.0.1:8787`에서 떠 있어야 합니다.

```json
{
  "mcpServers": {
    "moa": {
      "url": "http://127.0.0.1:8787/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MOA_MCP_TOKEN}"
      }
    }
  }
}
```

`npm run http:install`이 사용자 환경변수 `MOA_MCP_TOKEN`을 `.env`의 `MOA_MCP_TOKENS` 왼쪽 값과 맞춥니다. 적용하려면 Cursor를 재시작하세요. 토큰은 JSON에 하드코딩하지 마세요. `service_role`은 클라이언트에 넣지 않습니다.

STDIO로 되돌리려면:

```json
{
  "mcpServers": {
    "moa": {
      "command": "node",
      "args": ["mcp-server/server.mjs"]
    }
  }
}
```

## 이후: 라즈베리파이

PC 대신 파이가 서버가 되면 Cursor URL만 바꿉니다. 서버 코드는 같습니다.

1. 파이에 Node 18+와 `mcp-server/`·`.env`를 둡니다.
2. `scripts/moa-mcp-http.service`의 경로를 고친 뒤 `systemctl enable --now moa-mcp-http`로 상시 실행합니다.
3. 프로세스는 `127.0.0.1:8787`에 두고, 회사 PC 접근은 Cloudflare Tunnel 등 HTTPS 뒤에 둡니다.
4. Cursor `url`을 `https://터널주소/mcp`로 바꿉니다. Bearer는 그대로입니다.

## 노출 도구

| 도구 | 입력 | 동작 |
| --- | --- | --- |
| `list_spaces` | 없음 | 현재 사용자가 membership을 가진 공간만 조회 |
| `get_today_tasks` | `space_id` | 해당 공간의 로컬 프로세스 기준 당일 마감 할일 조회. 지연 할일은 `list_tasks` |
| `list_tasks` | `space_id`, 선택적 `due_date`, `status` | 할일 목록 조회. `status`는 `open` 또는 `done` |
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

`service_role` 키는 브라우저 웹 앱, GitHub Pages 정적 파일, Git 저장소, MCP 응답에 절대 넣지 마세요. 지금 단계는 이 PC의 `127.0.0.1` HTTP만 사용합니다. 라즈베리파이로 옮길 때도 프로세스는 루프백에 두고 HTTPS 터널 뒤에 두며, 클라이언트에는 Bearer만 둡니다.

## 구현 범위 밖

- Supabase migration을 자동 실행하지 않습니다.
- 웹 앱의 `localStorage`를 이전하지 않습니다.
- MCP를 인터넷에 직접 공개하지 않습니다. 지금은 `127.0.0.1`만, 이후 파이는 터널 뒤에 둡니다.
- 임의 SQL, 임의 REST 테이블 경로, membership 변경, 초대 생성·참여 도구를 노출하지 않습니다.
