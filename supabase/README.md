# Supabase 설정

## 1. 스키마 적용

Supabase Dashboard의 SQL Editor에서 다음 파일을 통째로 실행합니다.

```text
supabase/migrations/001_initial_schema.sql
```

이 migration은 profiles, spaces, memberships, 초대, 할일, 반복 일정, 아이디어 테이블과 RLS 정책을 생성합니다. `create_space`, `create_space_invite`, `join_space`, `create_task`, `update_task`, `complete_task`, `postpone_task`, `archive_idea`, `convert_idea_to_task` 등 웹과 MCP가 함께 사용하는 함수도 포함합니다.

이미 `001_initial_schema.sql`을 적용한 프로젝트는 `supabase/migrations/002_kakao_profile_name.sql`도 실행합니다. 카카오 닉네임과 이메일 가입 시 입력한 이름을 프로필에 넣습니다.

## 2. 이메일 인증

Authentication → URL Configuration에서 다음 주소를 Site URL 또는 Redirect URL로 등록합니다.

```text
https://donggrri.github.io/moa/
http://localhost:5173/
```

이메일 확인을 켜면 회원가입 후 인증 메일의 링크가 위 주소로 돌아오는지 확인하세요.

## 2.1 카카오 로그인

카카오 REST 키와 Client Secret은 브라우저가 아니라 **Supabase Authentication → Providers → Kakao**에만 넣습니다. 프론트엔드는 `signInWithOAuth({ provider: 'kakao' })`만 호출합니다.

1. [Kakao Developers](https://developers.kakao.com/)에서 앱을 만들고 카카오 로그인을 켭니다.
2. REST API 키를 Supabase Kakao **Client ID**로 씁니다.
3. REST API 키의 **Kakao Login Client Secret**을 활성화한 뒤 Supabase Kakao **Client Secret**으로 넣습니다.
4. Kakao Redirect URI는 앱 주소가 아니라 Supabase 콜백입니다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

이 프로젝트는 `https://rhobkvxtyscwfceiowpx.supabase.co/auth/v1/callback` 입니다. 값은 Authentication → Providers → Kakao의 Callback URL에서도 복사할 수 있습니다.

5. Supabase URL Configuration의 Redirect URL에 `https://donggrri.github.io/moa/`와 `http://localhost:5173/`가 있어야 합니다.
6. 동의 항목에 `profile_nickname`, `profile_image`를 켭니다.
7. Supabase Kakao 제공자의 기본 scope에 `account_email`이 들어 있습니다. 카카오는 비즈 앱에서만 이메일을 줄 수 있으므로, 개인 개발자면 **비즈 앱 전환(본인인증)** 후 `account_email` 동의 항목을 켜야 합니다. 이메일을 받지 못하면 Kakao 제공자에서 **Allow users without an email**도 켭니다.

카카오 앱의 Web 사이트 도메인에는 `http://localhost:5173`과 `https://donggrri.github.io`를 등록합니다. Client Secret·REST API 키는 GitHub와 `supabase-config.js`에 넣지 마세요.

설정이 끝나면 [`../tests/release/web-kakao.md`](../tests/release/web-kakao.md)로 로컬·초대·Pages를 확인합니다. 카카오 동의 화면은 CI가 돌리지 않습니다.

## 3. 프론트 설정

루트의 `supabase-config.example.js`를 참고해 `supabase-config.js`의 두 값을 입력합니다.

- `url`: Supabase Project URL
- `publishableKey`: publishable 또는 anon key

새 대시보드에서는 `anon` 대신 **Publishable key** (`sb_publishable_...`)를 복사하면 됩니다. 로컬에서 인증 메일이 오지 않으면 Authentication → Providers → Email에서 Confirm email을 끄고 같은 계정으로 로그인하세요.

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
- 날짜가 지난 미완료 할일은 삭제되지 않습니다. 웹의 **오늘** 화면은 당일 마감과 미완료 지연 할일을 함께 보여 주고, **전체 할일**에서도 지연으로 표시합니다.

## 6. 운영 전 확인

- RLS가 모든 업무 테이블에서 켜져 있는지 확인
- 서로 다른 계정이 다른 공간의 데이터를 읽지 못하는지 확인
- 반복 할일을 두 브라우저에서 동시에 완료해도 다음 회차가 하나만 생성되는지 확인
- service role key가 GitHub 저장소와 프론트엔드 번들에 없는지 확인
- 생략 인자로 만든 초대에 만료일과 사용한도가 채워지는지 확인
