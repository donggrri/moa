# PLAN: 공간 노트 (UpNote형 5기능)

상태: Phase 1 완료. atomic-workflow 스킬은 이 머신에 없어 동일 역할을 이 파일로 대체한다.  
워크트리: `C:\Users\tlsfmswls\Desktop\Note-space-notes` (`feat/space-notes`)  
기준 커밋: `af88aee`

## 한 줄 목표

모아의 할일·아이디어 흐름은 유지한 채, 공동 공간에 **마크다운 노트**를 추가하고 이미지·태그 검색·그래프·읽기 전용 공개 페이지를 붙인다.

## 하지 않을 것

- 아이디어 본문을 노트로 확장하기 (UI 500자, 할일 전환 개념과 충돌)
- React/Vite/TipTap 도입 (현재는 바닐라 JS + GitHub Pages)
- 중첩 노트북, 암호 노트, PDF 미리보기, 오프라인 우선, 공동 실시간 편집
- 옵시디언 태그 노드·타임랩스·화살표 물리 튜너
- MCP 노트 도구 (웹이 안정된 뒤)

## 도메인

| 용어 | 의미 | 피하기 |
|---|---|---|
| 노트(Note) | 공간 멤버가 함께 쓰는 마크다운 문서 | 아이디어, 메모, 할일 |
| 태그(Tag) | 노트 본문의 `#이름`에서 추출한 공간 공유 분류 | 노트북, 카테고리 |
| 위키링크(Wiki link) | `[[제목]]`으로 다른 노트를 가리키는 연결 | URL, 첨부 |
| 백링크(Backlink) | 이 노트를 가리키는 다른 노트 목록 | 그래프 자체 |
| 공개 페이지(Public page) | 추측 불가 토큰으로 여는 읽기 전용 스냅샷 | 공동 편집, 검색 노출 |

아이디어 → 노트, 노트 → 할일 전환은 이번 범위 밖이다. 나중에 `source_idea_id` / `converted_task_id`로 붙일 수 있게 스키마만 열어 둔다.

## 의존 순서

```text
마크다운 노트
  → 이미지
  → 태그 검색
  → 위키링크 + 백링크 + 그래프
  → 공개 페이지
```

## 데이터 모델

새 마이그레이션 `supabase/migrations/002_space_notes.sql`. 모든 새 테이블은 **즉시 RLS on**, 정책 없는 동안 fail-closed.

### notes

- `id`, `space_id`, `title`, `body_md` (마크다운 원문, 상한 100KB)
- `author_id`, `created_at`, `updated_at`
- `publish_token` (nullable, unique), `published_at` (nullable)
- `unique (id, space_id)` — 기존 ideas/tasks와 같은 공간 격리 패턴
- 멤버: CRUD. anon: `publish_token`이 있는 **한 행만** 토큰 일치 시 SELECT. 목록 금지

### note_tags

- `note_id`, `space_id`, `tag` (소문자, `[a-z0-9가-힣_-]`, 공백 없음)
- unique `(note_id, tag)`, index `(space_id, tag)`
- 저장 RPC가 본문의 `#태그`를 파싱해 교체

### note_links

- `from_note_id`, `to_note_id`, `space_id`, `raw_title`
- `to_note_id`는 미해결 링크면 null (고아 노드)
- 저장 시 `[[제목]]`을 파싱해 교체. 같은 공간 제목 매칭(대소문자 무시)

### note_assets

- `id`, `note_id`, `space_id`, `storage_path`, `mime`, `byte_size`, `width`, `height`
- 본문에는 `![alt](moa-asset:<asset_id>)`만 저장. 공개 URL을 본문에 박지 않음

### Storage

- 버킷 `note-images`, **private**
- 경로 `{space_id}/{note_id}/{asset_id}.{ext}` — 클라이언트가 경로를 고르지 않음
- authenticated: 공간 멤버만 insert/select/delete
- anon select: 부모 노트가 공개된 asset만. 객체 키는 UUID
- 업로드 전 클라이언트 리사이즈: 1MB 미만 유지, 이상은 짧은 변 1000px · JPEG/WebP 품질 90
- 허용: image/jpeg, image/png, image/webp. 장당 5MB, 노트당 20장

### RPC

기존처럼 웹이 RPC만 부르게 한다.

- `list_notes`, `get_note`, `upsert_note` (본문 저장 + 태그/링크 재인덱싱)
- `search_notes` (제목/본문 ilike 또는 pg_trgm, 태그 필터)
- `list_note_tags`
- `set_note_published(p_note_id, p_publish boolean)` — 토큰 발급/폐기
- `rotate_note_publish_token`
- `get_published_note(p_token text)` — SECURITY DEFINER, 토큰 한 건, 미공개 위키링크 제목 제거 또는 비공개 표시
- `create_note_asset` / 삭제

`get_published_note`는 미공개 대상 링크를 따라가지 않는다. 연결된 노트 동시 공개는 2차.

## UI (바닐라 JS 유지)

- 사이드바에 **노트** 뷰 추가. 오늘/할일/아이디어와 병렬
- 3열: 노트 목록 · 에디터 · (태그/백링크 패널)
- 에디터: textarea 원문 + 미리보기 토글. CDN `markdown-it` + `DOMPurify`
- 이미지: 툴바 삽입, 붙여넣기, 드래그. 업로드 후 `moa-asset:` 문법 삽입
- 태그: 본문 `#태그` 자동 인식, 사이드바 태그 목록, 클릭 시 필터, 검색창 `#집안일`
- 그래프: 별도 뷰. CDN `d3-force`. 전역/로컬(깊이 1~2), 고아 토글, 점 클릭 시 노트 열기. 노드 크기 = degree
- 공개: 노트 상단 공유 → 링크 복사 / 중지 / 재발급. `public.html#t=<token>`
- `public.html`은 로그인 셸 없이 렌더. `noindex`, `referrerpolicy=strict-origin`. GitHub Pages에 정적 파일로 추가

토큰은 URL **hash**에 둔다. 쿼리스트링이면 GitHub Pages 액세스 로그에 남을 수 있다.

## 공개 페이지 보안

- 새 테이블 RLS 누락 금지. 정책 없이 enable만 하면 fail-closed
- anon 목록/검색 없음. 토큰 exact match만
- 마크다운은 DOMPurify 후 삽입. `javascript:` 링크 제거
- 미공개 위키링크는 텍스트만 보이거나 숨김. 클릭해도 get_note 호출 안 함
- 공개 철회 시 토큰 null, 이미지 anon 정책이 즉시 막힘
- 비공개 링크는 비밀이 아님을 UI에 한 줄로 명시

## 스택 제약

- GitHub Pages + 기존 `supabase-js` UMD CDN
- 에디터/그래프도 CDN. npm 빌드 없음
- `service_role`은 브라우저·git에 넣지 않음 (기존 규칙)
- 프론트 한도는 DB 한도와 맞출 것 (아이디어처럼 UI 500 / DB 5000 불일치 재현 금지)

## 검증

- 멤버가 노트 CRUD, 이미지 붙여넣기, `#태그` 필터, `[[제목]]` 후 그래프 선 생성
- 비멤버 브라우저에서 노트 목록이 비는지
- 공개 링크: 로그아웃/다른 브라우저에서 읽기, 중지 후 404, 미공개 링크 누수 없음
- XSS: `<script>`, `javascript:` 가 공개 페이지에서 실행되지 않는지
- 기존 오늘/할일/아이디어/초대 회귀 없음

## 구현 작업 (g-task에서 체크박스로 쪼갤 것)

1. 스키마·RPC·RLS·Storage 버킷
2. 노트 목록/에디터 UI + 마크다운 미리보기
3. 이미지 업로드·본문 삽입
4. 태그 추출·사이드바·검색
5. 위키링크·백링크·그래프
6. 공개 페이지 + 토큰 회수
7. CONTEXT.md / README 용어·사용법

## 다음 단계

`/g-task`로 이 PLAN을 `TASKS-space-notes.md` 체크리스트로 나눈 뒤 `/g-execute`로 구현한다.
