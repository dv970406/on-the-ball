# API·Supabase 컨벤션

## Route Handler

- **모든 데이터 접근은 App Router Route Handler(`app/api/*`)를 경유**한다. 클라이언트는 Supabase에 직접 쿼리하지 않는다(인증=익명 로그인만 클라에서).
- 핸들러는 `withSupabase`/`ok`/`fail`(`@/shared/api/handler`)을 쓴다. 입력은 **zod**로 검증.
- 응답 규격: 성공 `ok(data)` → `{ data }`, 실패 `fail(status, "한국어 메시지")` → `{ error }`. `ok`/`fail`은 `Cache-Control: private, no-store`를 자동 부여(개인화 응답 캐시 유출 방지).
- snake_case ↔ camelCase 매핑은 `entities/*/api/mappers.ts`(서버 안전, `"use client"` 없음)에서. 새 라우트도 이 매퍼를 재사용.

## DB 정책 (Supabase)

- 쓰기(투표·퀴즈 시도 등)는 **SECURITY DEFINER RPC**로만(`cast_vote`·`submit_quiz_attempt`). 중복 방지·마감 검증·24h 변경 정책·스트릭·뱃지를 원자 처리 → 런타임 service role 불필요.
- 민감 컬럼은 **컬럼 권한**으로 보호:
  - 퀴즈 정답/해설(`is_correct`·`answer_text`·`seed_picks`)은 시도자에게만(뷰 게이트). `quizzes`/`quiz_choices`는 **`select *` 금지**(컬럼 명시).
  - `profiles`는 공개 컬럼(닉네임·팬 태그)만 읽기 / 편집 허용 컬럼만 update. 스트릭 등은 RPC 전용. 본인 전체 행은 **`my_profile` 뷰**로 조회(`select *` 금지).
- 집계는 SECURITY DEFINER 뷰(`poll_results`·`quiz_stats` 등)로 공개, 개별 투표 행은 본인만.
- **DB 변경은 새 마이그레이션 파일**로 추가한다(기존 `0001`/`0002`는 원격에 적용 완료 — 수정·재적용 금지). 로컬은 643xx 포트 스택.

## meta jsonb 파싱

- `poll_options.meta`/`polls.meta`의 jsonb는 **`as X` raw 캐스팅 금지**. `entities/poll/lib`의 안전 파서로 읽어 계약 밖 값(누락·타입 불일치)을 기본값으로 방어:
  - `readSideMeta`(밸런스), `readKitMeta`(유니폼), `readRankingMeta`(랭킹), `readTmiOptionMeta`(TMI 선택지), `readTmiPollMeta`(TMI 카드).
