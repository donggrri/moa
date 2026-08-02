# Supabase 설정

## 1. 스키마 적용

Supabase Dashboard의 SQL Editor에서 다음 파일을 통째로 실행합니다.

```text
supabase/migrations/001_initial_schema.sql
```

이 migration은 profiles, spaces, memberships, 초대, 할일, 반복 일정, 아이디어 테이블과 RLS 정책을 생성합니다. `create_space`, `create_space_invite`, `join_space`, `create_task`, `update_task`, `complete_task`, `postpone_task`, `archive_idea`, `convert_idea_to_task` 등 웹과 MCP가 함께 사용하는 함수도 포함합니다.

## 2. 이메일 인증

Authentication → URL Configuration에서 다음 주소를 Site URL 또는 Redirect URL로 등록합니다.

```text
https://donggrri.github.io/moa/
http://localhost:5173/
```

이메일 확인을 켜면 회원가입 후 인증 메일의 링크가 위 주소로 돌아오는지 확인하세요.

## 3. 프론트 설정

루트의 `supabase-config.example.js`를 참고해 `supabase-config.js`의 두 값을 입력합니다.

- `url`: Supabase Project URL
- `publishableKey`: publishable 또는 anon key

이 값은 브라우저에 노출될 수 있는 공개 값입니다. service role key나 DB 비밀번호를 입력하면 안 됩니다.

## 4. Realtime

Database → Replication에서 `tasks`, `ideas`, `recurrence_rules`, `memberships`의 변경 스트림이 활성화되어 있는지 확인합니다. migration이 publication에 추가를 시도하지만, 프로젝트 설정에 따라 Dashboard에서 한 번 더 확인해야 할 수 있습니다.

## 5. 보안·권한 제한

- 할당자는 비워 두거나 같은 공간의 active 멤버로만 지정할 수 있습니다.
- 할일은 브라우저에서 직접 INSERT/UPDATE/DELETE하지 않고 RPC를 통해 생성·수정·완료·연기합니다. 반복 규칙은 `active` 토글만 직접 허용하고, 생성·변경은 할일 RPC가 처리합니다.
- 할일의 `recurrence_rule_id`는 같은 `space_id`의 규칙만 참조할 수 있도록 복합 FK로 묶입니다.
- 아이디어의 생성과 제목·본문 수정은 허용하지만 `status`·`converted_task_id` 변경은 RPC 경로로 제한합니다.
- 초대 코드는 `pgcrypto` 기반으로 생성되며, 생략 시 7일·20회 기본 제한이 적용됩니다. 만료되면 관리자 권한으로 새 초대를 발급할 수 있습니다.
- 마지막 active owner membership은 삭제하거나 강등할 수 없습니다. 소유권 이전 UI는 아직 없으므로, 소유자가 공간을 떠나려면 먼저 다른 owner를 두어야 합니다.

## 6. 운영 전 확인

- RLS가 모든 업무 테이블에서 켜져 있는지 확인
- 서로 다른 계정이 다른 공간의 데이터를 읽지 못하는지 확인
- 반복 할일을 두 브라우저에서 동시에 완료해도 다음 회차가 하나만 생성되는지 확인
- service role key가 GitHub 저장소와 프론트엔드 번들에 없는지 확인
- 생략 인자로 만든 초대에 만료일과 사용한도가 채워지는지 확인
