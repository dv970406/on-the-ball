# 데이터 접근·Supabase 컨벤션

## 데이터 접근 경로

- **클라이언트가 supabase를 직접 호출한다.** Route Handler(`app/api/*`)를 두지 않는다 — 중간 검증층 없이
  **RLS가 방어선**이다. 외부 API를 서버 비밀로 불러야 하는 자리가 생겨 예외를 둘 때의 규약은
  `nextjs.md`의 "Route Handler를 두지 않는다" 절이 갖는다.
  - ⚠ `SUPABASE_SERVICE_ROLE_KEY`는 **`shared/config/env`에 넣지 않는다** — 그 모듈은 클라이언트
    번들에 실린다. service_role은 `scripts/`의 운영 스크립트만 쓴다. 웹 푸시의 VAPID **비밀키**도 같다 —
    앱이 갖는 것은 공개키(`env.vapidPublicKey`)뿐이고 발송은 수집 스크립트가 한다(`nextjs.md` 웹 푸시 절).
- 단 컴포넌트가 supabase를 직접 만지지 않는다. **모든 접근은 `entities/*/api`의 TanStack Query 훅을 경유**한다. 이유는 raw fetch를 금지했던 것과 같다 — 중복 제거·캐싱·로딩/에러 상태를 잃지 않기 위해서다. 게다가 낙관적 업데이트가 queryKey를 전제로 한다.
- 브라우저 클라이언트는 `requireBrowserSupabase()`(`@/shared/api`)로 얻는다. 모든 호출부가 같은 null 가드를 반복하지 않도록 한 곳에서 한국어 에러로 바꾼다.
- 브라우저 클라이언트는 **`@supabase/ssr`의 `createBrowserClient`(쿠키 저장)** 를 쓴다. `@supabase/supabase-js`의 `createClient`(localStorage)로 바꾸면 `proxy.ts`가 쿠키를 못 읽어 **서버 토큰 리프레시가 통째로 죽고**(오래 비운 뒤 돌아온 사용자가 조용히 로그아웃된다) SSR이 세션을 보지 못해 개인화도 사라진다.
- 서버(`generateMetadata`·서버 컴포넌트)에서는 `@/shared/api/supabase-server`를 **직접 경로로** import한다(`next/headers` 의존이라 배럴에 싣지 않는다).
- snake_case ↔ camelCase 매핑은 `entities/*/api/mappers.ts`(순수·서버 안전, `"use client"` 없음)에서.

## 스키마 타입은 손으로 적지 않는다

DB 행 타입은 **supabase CLI가 생성**한다. 마이그레이션을 추가하면 반드시 다시 뽑는다.

```bash
pnpm db:types   # supabase gen types --local --schema public > src/types/database.types.ts
```

- `src/types/database.types.ts`는 **생성 파일**이다. 손으로 고치지 않는다(ESLint 제외 목록에 있다).
- supabase 클라이언트에 `Database`를 붙여 두었다 → **테이블명·컬럼명·RPC명·RPC 인자·insert 컬럼이 전부 컴파일 타임에 검증된다.** `.from("transfer_dael")`·`.insert({ deal: 1 })` 같은 오타가 빌드에서 잡힌다.
- 엔티티의 도메인 타입은 행과 1:1이 아니지만(camelCase + 파생 필드), **각 필드 타입을 행에서 가져와** 스키마와 묶어 둔다:
  ```ts
  export type TransferDealRow = Database["public"]["Tables"]["transfer_deal"]["Row"];
  export interface TransferDeal {
    id: TransferDealRow["id"];
    latestReportedAt: TransferDealRow["latest_reported_at"];
    isWatched: boolean;        // 파생 — 행에 없다
    // ...
  }
  ```
- select 결과 형태도 마찬가지다(`entities/transfer/api/mappers.ts`의 select 행 타입) — `Pick<…Row, ...>` + 임베딩만 직접 적는다.
- 마이그레이션으로 컬럼이 바뀌면 `pnpm db:types` → **매퍼·화면에서 컴파일 에러로 드러난다**. 이게 이 구조의 목적이다.
- ⚠ **`generated always as … stored` 컬럼은 이 보증에서 빠진다.** 생성기가 identity(`id?: never`)는
  걸러내면서 생성 컬럼은 `Insert`·`Update`에 **쓰기 가능한 것처럼** 남긴다(실측: `transfer_news.body_excerpt` 같은 생성 컬럼).
  ⚠ 다만 이것은 **무결성 문제가 아니라 DX 문제다** — Postgres가 `cannot insert a non-DEFAULT
  value into column` / `can only be updated to DEFAULT`로 **superuser에게도** 거부하므로,
  grant를 열어도 값이 들어가지 않는다(실측). 타입이 통과시킨 코드가 런타임에 죽을 뿐이다.
  ⚠ `database.types.ts`는 생성 파일이라 **손으로 고쳐 막지 않는다.**

## 테이블 이름이 **부모를 말한다**

부모에 종속된 테이블은 부모 이름을 접두어로 단다. 자식이 더 있으면 그 자식도 같은 접두어를
이어받는다 — 루트만 바꾸고 자식을 두면 부모와 자식의 이름이 어긋나 안 하느니만 못하다.

```
transfer_deal · transfer_deal_watch · transfer_deal_suitor   ← watch·suitor는 deal에 딸린다
transfer_club · transfer_club_follow                          ← follow는 club에 딸린다
profiles      · profiles_push_subscription                    ← 구독은 계정에 딸린다
```

**판정은 취향이 아니라 컬럼이 한다** — 그 테이블의 PK·FK가 부모를 향하면 종속이다.
`transfer_deal_watch`는 기본키가 `(user_id, deal_id)`이고 딜이 지워지면 함께 지워진다 → 딜의 자식이다.
반대로 자체 PK를 갖고 다른 행에 매달리지 않는 테이블은 접두어를 부모 이름으로 달지 않는다 —
**접두어가 없다는 것 자체가 "부모가 없다"는 신호**다.

⚠ **FSD 슬라이스명은 여기 따라오지 않는다.** 슬라이스는 앱 안의 도메인 개념이라 테이블명과
1:1인 적이 없다(`entities/transfer` ↔ `transfer_deal`·`transfer_news`·`transfer_club`,
`features/watch-transfer` ↔ `transfer_deal_watch`, `entities/profile` ↔ `profiles`). 연결고리는
각 슬라이스의 `model/types.ts`가 `Tables["…"]`로 한 줄 갖는다.

⚠ **개명은 URL을 보고 결정한다.** 자기 경로를 갖지 않는 테이블은 언제든 고칠 수 있지만,
`/transfers`처럼 사이트맵에 실린 경로를 낳는 이름은 **영구 계약**이라 그 비용이 이름의
정확도를 넘어선다(`nextjs.md`).

## 열거값은 **enum**으로 둔다 — lookup 테이블이 아니라

값의 목록이 정해진 컬럼(이적 단계 `transfer_stage` 같은)은 `create type ... as enum`으로 만든다.
`text + check`도, 코드 테이블 + FK도 아니다. 바로 위 절이 말한 **생성 타입**을 그대로 얻기 때문이다.

⚠ **값이 곧 산술에 쓰이는 부호(좋아요 `1` · 싫어요 `-1`)는 enum이 아니라 `smallint + check`다**
(`transfer_deal_comment_vote.value`). 합계 트리거와 클라이언트의 낙관적 계산이 그 값을 그대로 더하고 빼므로,
enum이면 양쪽에 라벨 → 부호 변환이 한 벌씩 생긴다. 라벨이 붙는 값이 아니라 수치다.

- 생성 파일이 **유니온 타입과 런타임 배열을 둘 다** 내려준다
  (`Database["public"]["Enums"]["transfer_stage"]` · `Constants.public.Enums.transfer_stage`).
  FK로 두면 그 자리가 `number`가 되어 도메인이 통째로 사라진다.
- 슬라이스가 **노출 순서 배열 + 라벨맵**을 얹으면 값 추가 시 누락이 **양방향 컴파일 에러**가 된다:
  `as const satisfies readonly T[]`(없는 값 금지) + `Exclude<T, (typeof ARR)[number]> extends never`
  (빠뜨린 값 금지) + `Record<T, string>`(라벨 누락 금지). 선례는 `entities/transfer`의
  `Record<TransferStage, …>` 맵(`STAGE_GROUP`·`STAGE_STATUS`)과 `TRANSFER_LEAGUES`의 망라성 가드.
  ⚠ 망라성 가드는 **타입 별칭만 선언하면 아무것도 검사하지 못한다** — 실제 값에 할당해야 컴파일러가 대조한다.
- **런타임 배열이 그대로 입력 검증이 된다** — 노출 배열을 `readonly string[]`로 넓혀
  `includes`로 좁히는 타입 가드 하나면 끝난다(`parseTransferLeague`가 같은 형태다). 값이 lookup
  테이블 행이면 배열이 조회 결과가 되어 이 검사가 **비동기**가 된다.
- 화면이 **동기**로 끝난다(`.map()`). 조회 훅이면 목록에 Skeleton·EmptyState가 붙는데,
  칩 레일처럼 첫 화면 최상단에 있는 요소에서는 "로딩 중 레이아웃이 튀지 않게 한다"와 정면으로 부딪힌다.

### 값이 곧 라벨이면 한국어, 문장으로 보여야 하면 영문 키 + 라벨맵

- 화면에 그 단어가 **그대로** 나가는 값은 저장값을 한국어로 둔다 — 라벨맵을 두면 같은 문자열을
  두 곳에 적는 셈이 된다.
- 문장·문구로 다듬어 보여야 하는 값은 **영문 키 + 라벨맵**이다 — 저장값을 문장으로 두면 문구를
  다듬을 때마다 `alter type`이 필요하다. `transfer_stage`가 이쪽이다(영문 키 → 상태 뱃지 라벨 맵).

#### 운영 데이터의 한국어 표기는 **유일한 writer가 입힌다**

구단 이름처럼 화면에 그대로 나가는 운영 데이터는 저장값이 한국어여야 한다. API가 주는 영문
이름을 그대로 저장하고 화면에서 옮기는 형태로 두지 않는다.

⚠ **매핑은 그 컬럼의 유일한 writer 안에 있어야 한다.** `transfer_club`에는 쓰기 정책도 grant도
없어 딜 파생 스크립트가 유일한 writer인데, 매핑이 마이그레이션이나 클라이언트에 있으면
**다음 파생이 통째로 덮어쓴다.** 그래서 표기는 `scripts/lib/transfer/club-presets.json`·
`scripts/team-names-ko.json`이 갖고 파생이 쓰기 직전에 입힌다.

⚠ **매핑이 없으면 실패시키지 않고 경고한다.** 새 구단이 생겨도 파생은 성공해야 한다
(영문으로라도 화면에 떠야 한다) — 대신 스크립트가 빠진 이름을 로그에 찍어 무엇을 채울지 남긴다.

⚠ `name`(정식)과 `short_name`(약칭)의 **쓰임이 다르다.** 좁은 폭에 두 구단을 좌우로 놓는
자리(목록 행·경로 표시)는 **약칭**이다 — 정식명은 잘리는데 **잘린 구단 이름은 어느 구단인지
알 수 없다.** 정식명은 가로 폭을 이름에 전부 내줄 수 있는 자리에서만 쓴다.

### ⚠ enum 값은 **지울 수 없다**

`add value`와 `rename value`만 된다 — `drop value`는 PostgreSQL에 구현되어 있지 않다(실측).
값을 폐기하면 노출 배열에서만 빠지고 타입에는 영구히 남는다. **되돌릴 수 없는 결정이므로 값을
추가하기 전에 "이걸 나중에 없앨 일이 있는가"를 먼저 답한다.**

⚠ `add value`한 값은 **같은 트랜잭션 안에서 쓸 수 없다** — 추가와 백필을 한 마이그레이션에 담지 않는다.

### lookup 테이블로 옮겨야 하는 조건

아래 중 **하나라도** 성립하면 enum을 고집하지 않는다.

- 값을 **운영자가 런타임에 추가·폐기**해야 한다.
- 문구를 **배포 없이** 바꿔야 한다.
- 정렬 순서·심각도 같은 **부가 정보를 데이터로** 들어야 한다.

⚠ **관리 화면이 없는 동안은 셋 다 성립하지 않는다.** 운영자가 DB를 직접 만져야 하므로
"마이그레이션 대신 psql"일 뿐 절차가 줄지 않고, 위의 컴파일 타임 보증만 잃는다.
→ 관리 화면을 만드는 작업과 **같은 시점에** 옮긴다.

옮길 때의 형태:

- **정수 id가 아니라 `code text primary key`.** 저장값이 `spam` 그대로 읽혀야 참조 테이블을
  열었을 때 뜻을 알 수 있다. 숫자 FK는 조인 없이는 아무 말도 하지 않는다.
- 이름은 **무엇의 목록인지** 드러낸다(`…_reason`·`…_stage`) — 뭉뚱그린 명사는 "접수 건" 같은
  행 테이블로 읽혀 헷갈린다.
- 따라오는 것을 미리 세어 둔다: RLS enable + 정책 최소 하나 + `revoke all` / `grant select` +
  시퀀스 revoke(셋 다 `rls.sql`의 전수 가드가 본다) + `rls.sql` 새 섹션 + `supabase/seed.sql` 초기 행 +
  `entities`의 조회 훅(queryKey·staleTime·Skeleton·EmptyState) + 배럴 노출.
  ⚠ 그 테이블은 **비로그인에게도 열린 새 조회 표면**이 된다(칩·시트는 로그인 전에도 보인다).


### 엠블럼은 **DB에 두지 않는다** — 구단 코드에서 유도한다

구단 엠블럼은 컬럼이 아니라 **저장소에 커밋한 정적 자산**이다
(`public/crests/{code}.png`, `scripts/fetch-team-crests.mjs`가 만든다). 파일명이 곧
`transfer_club.code`이고 조립은 `TransferCrest`가 한다.

- 코드와 한국어 표기는 표시 프리셋 `scripts/lib/transfer/club-presets.json`이 갖는다(프리미어리그
  한국어는 `team-names-ko.json`만 본다). 해외 리그(라리가·분데스리가·세리에 A·리그 1)는
  `fetch-team-crests.mjs --league <id>`로 받는다 — 파일명은 API 이름을 `slugify`한 값이다.
  ⚠ **프리셋 코드가 슬러그와 다른 구단(프리미어리그 전부)은 `--team <id> --code <code>`로 받는다** —
  `--league`로 받으면 같은 구단의 파일이 둘 생긴다. **이미 있는 파일은 덮지 않는다**(`--force` 제외).
  리그 구성이 바뀌면 프리셋과 구단 사전을 함께 고치고, `scripts/test-transfer-extract.mjs`가
  프리셋·사전·파일 셋을 대조한다.
- **5대 리그 밖은 리그 단위로 받는다** — 이적설에 자주 나오는 리그(스크립트의 `EXTRA_LEAGUES`)의 1부 구단 전부다. 구단마다
  "유명한가"를 사람이 판단하지 않는다(기준이 흔들린다). 엠블럼만 생기고 프리셋(리그 필터·응원 구단의 대상)에는 들지 않는다.
  승강이 바뀌므로 **이적 창이 바뀔 때 다시 돌린다**(이미 있는 파일은 덮지 않는다 — 새로 올라온 구단만 받는다).
  - ⚠ **파일명은 API 이름이 아니라 딜 파생이 만드는 코드다** — 프리셋 밖 구단의 코드는 `slugify(정규 영문명)`이라("West Ham" →
    `west-ham-united`) API 이름을 구단 사전의 별칭 **통째 일치**로 정규화하고, 줄인 이름("Derby")은 그 이름으로 시작하는 정규명이
    사전에 **하나뿐일 때만** 푼다. ⚠ 부분 일치로 넓히지 않는다 — "Sporting Braga"가 스포르팅 CP의 엠블럼을 가져간다.
  - 사전 밖 구단은 코드가 **기사 표기 그대로**라 공식 이름과 갈린다("Al-Hilal Saudi FC" ↔ `al-hilal`) → 같은 그림을 흔한 표기의
    코드로도 저장한다(법인 접미를 걷은 표기 + 스크립트의 `CREST_CODE_ALIASES` 표). ⚠ 걷으면 다른 구단과 겹치는 이름은 만들지
    않는다(`AMBIGUOUS_CODES` — "Los Angeles"). 그래도 화면에 모노그램으로 남는 구단이 보이면 그 코드를 표에 더한다.
  - ⚠ **구단 사전에 수십 구단을 더하는 것으로 대신하지 않는다** — 사전은 추출과 LLM 판정 지시문(구단 표)에 쓰여, 바꾸면 추출 결과와
    판정 지문이 함께 바뀐다(재추출·재판정 비용). 엠블럼은 화면만의 일이라 파일 이름으로 메운다.
  - ⚠ 공유 카드 함수는 엠블럼 폴더 전체를 싣는다(`outputFileTracingIncludes`) — 리그를 더하면 그 함수의 크기도 함께 는다.
- ⚠ **파일명을 바꾸면 프리셋의 `code`도 함께 바꾼다** — 화면이 `code`로 경로를 만들어, 한쪽만 바꾸면
  그 구단이 모노그램으로 떨어진다.
- **왜 컬럼이 아닌가**: 파일명이 코드라 경로가 결정적이다 — 컬럼을 두면 같은 사실을
  두 곳이 갖게 되고, 값의 형식을 지키는 CHECK와 그것을 채우는 스크립트가 **한 쌍으로 묶여**
  둘이 갈리는 순간 그 행이 통째로 거부된다. 유도하면 그 계약 자체가 없어진다.
- **왜 제공자 CDN을 직접 걸지 않는가**: 원본이 화면 크기의 8배 가까이 과하고, 제공자가 리사이즈
  파라미터를 지원하지 않는다(실측). 근거 수치와 포맷·크기 선택은 그 스크립트가 갖는다.
- ⚠ **런타임에 늘어나지 않는다.** 새 구단은 사람이 스크립트를 돌려 커밋해야 채워지고, 그동안
  화면은 약칭 모노그램으로 떨어진다(`Crest`) — `scripts/team-names-ko.json`의 한국어
  표기와 **같은 운영 모델**이다. 정기 실행 환경에서는 `public/`에 쓸 수 없으므로 이 부분을
  수집·파생 스크립트에 합치지 않는다.
- ⚠ **자산이 제공자의 것이다.** 핫링크에서 사본 서빙으로 옮긴 것이라 재배포에 해당한다 —
  공개 배포 전에 제공자 약관을 한 번 확인한다. 끄는 선택지가 필요해지면 `Crest`의 폴백
  (약칭 모노그램)으로 가르는 환경 플래그를 둔다 — 켜는 것이 명시적인 행위여야 위험이
  "코드를 되돌리는 일"이 아니라 "설정을 바꾸는 일"로 남는다.

## 이적시장 데이터는 보도에서 **파생**한다 — 앱에는 쓰기 경로가 없다

`transfer_news`(수집) → `transfer_club`·`transfer_deal`·`transfer_deal_suitor`·`transfer_name_ko`(파생)는 전부 운영 데이터다.
유일한 writer는 `scripts/sync-transfer-news.mjs`(service_role — 매시 GitHub Actions)이고 **정책도 grant도 SELECT뿐**이다
(아래 "운영진만 쓰는 데이터는 쓰기 경로를 만들지 않는다"). 수집·추출·LLM 판정·이름 표기·딜 파생의 규칙은
**`docs/conventions/transfer-pipeline.md`** 가 갖는다 — 파이프라인(`scripts/lib/transfer/**`)을 만질 때만 읽는다(AGENTS.md가 @import하지 않는다).

아래는 **앱이 읽는 파생 값의 계약**이다(어떻게 계산되는지는 그 문서).

- **`transfer_deal.deal_key`는 영구 계약이다** — `sha1(normalizePlayer(선수명)).slice(0,16)`. 관심·댓글·예측이 딜 `id`를 FK로
  잡으므로 파생은 `deal_key`로 upsert해 `id`를 보존한다. 선수당 딜이 하나다.
- **딜은 삭제하지 않고 다시 파생한다.** 지우는 것은 어떤 보도도 더는 가리키지 않는 딜뿐이고, **댓글·예측이 걸린 딜은 그때도
  지우지 않는다**(두 FK가 `on delete restrict`). 관심(`transfer_deal_watch`)은 cascade다(아래 cascade 절).
- **단계(`stage`)·결과 시각(`settled_at`)** — 단계는 LLM 판정을 거친 보도로 정하고, 결렬(`collapsed`)·부인(`denied`)은 이력
  (협상 이상까지 갔는가)으로 가른다 — 화면은 둘을 한 구간에 두고 뱃지·아이콘으로 가른다(`STATUS_LABEL`·`StatusBadge`·`ClubRoute`).
  `settled_at`은 합의 완료·오피셜일 때만 있고(CHECK `transfer_deal_settled_stage`) 그 보도의 **게시 시각**이다 — 예측 채점이
  결과 뒤의 표를 거르는 기준이다(아래 딜 성사 예측 절).
- **경로** — `from_club_code`는 늘 **보유 구단**이고 지금 임대로 뛰는 구단은 `loan_club_code`(경로 밖 한 줄)다. 행선지가 없는
  관심 구단은 `transfer_deal_suitor`에 **유력한 순(`position`)** 으로 들어 있다 — 순서뿐이고 비중은 없다. 한쪽이 비면 화면
  문구가 이유를 말한다(`entities/transfer/lib/route-label.ts` — 자유계약 출발 `FA` · 행선지 `미정`). 출발·행선지를 둘 다 못 읽은
  이적설은 딜이 아니다.
- **형태(`form`)·조항(`loan_clause`)** — 완전 이적·임대·완전 영입 전환·조기 복귀·임대 연장. `null`은 "모른다"다 — 화면은 완전
  이적으로 짐작하지 않는다(`entities/transfer/lib/deal-form.ts`).
- **금액** — `fee_*`는 지금 딜의 상대가 낸 최신 금액이고 `fee_kind`가 그 **성격**(이적료·제안액·요구액·바이아웃·평가액·임대료·조항
  금액)이다 — 성격 없이 그리면 "£86M에 이적"으로 읽힌다. `prev_fee_amount`(직전 보도의 다른 금액 — 변동폭의 기준, 같은 통화) ·
  `fee_low_amount`/`fee_high_amount`(보도 범위) · `loan_fee_text`(조항 금액이 대표일 때의 임대료) · `add_on_amount`(같은 통화의
  옵션만). `is_free_agent`는 보도 문장에서 확인한 것만이고 **빈 이적료를 FA로 추정하지 않는다**(이적료가 있으면 FA가 아니다 —
  CHECK `transfer_deal_free_agent_no_fee`) → 화면은 금액 → `FA(자유 계약)` → `미공개` 순이다(`feeLabel`).
- **보도 수·시각** — `report_count`·`first_reported_at`·`latest_reported_at`은 "이동 아님" 판정을 뺀 **서로 다른** 보도의
  수·시각이다. 화면의 "업데이트 N분 전"과 사이트맵 lastmod는 `latest_reported_at`이다(`updated_at`이 아니다 — 파생 컬럼
  아무것이나 바뀐 시각이라 보도와 맞지 않는다).
- **`transfer_news`의 공개 범위** — 원문 전문 `body`는 공개 키로 읽을 수 없고 생성 컬럼 `body_excerpt`(280자)만 anon·authenticated에
  열려 있다(그래서 그 역할은 `select=*`를 쓸 수 없다 — 컬럼을 나열한다). `deal_id`(속한 딜 — 매 파생마다 다시 배정된다)·
  `summary_ko`(한국어 두 문장 요약)는 열려 있고 `verdict*`(LLM 판정)는 비공개다. 공개된 `stage`·`fee_amount`는 **규칙 추출값**이라
  비공개 판정으로 정한 딜의 단계·금액과 갈릴 수 있다 — 보도별 단계·금액을 뱃지처럼 그리지 않는다.
  - "원문" 링크는 **`provenance_url ?? url`**(원저자 주소 우선)이고 요약·발췌 중 무엇을 그릴지(`gist`·`lang`)도 매퍼(`buildReport`)
    한 곳이 정한다 — 같은 자리에서 `&amp;`를 푼다(수집기가 엔티티를 풀지 않던 때의 행이 남아 있고 수집 컬럼은 고칠 수 없다).
- **이름 표기** — 선수·구단의 한국어 표기는 `transfer_name_ko` 캐시 + 사람 사전(`scripts/lib/transfer/players-ko.json` ·
  `glossary-ko.json`)에서 와 파생이 행에 입힌다. 표기가 없으면 화면은 영문으로 그린다 — 엠블럼과 같은 운영 모델이라 런타임에
  늘지 않는다.
- **운영 JSON 셋의 단일 소스** — 이적 창 일정 `scripts/lib/transfer/windows.json` · 보도 주체 표기 `scripts/lib/transfer/reporters.json`은
  파이프라인(Node)과 화면(TS)이 **같은 파일**을 읽는다(`shared/config/transfer-window.ts` · `entities/transfer/lib/reporter.ts` —
  파이프라인이 TS를 import할 수 없어 JSON이 원본이다). 시즌·시장 상황이 바뀌면 사람이 갱신한다.

## 사용자가 쓰는 표 — 관심 · 응원 구단 · 알림 · 댓글 · 예측

### `transfer_deal_watch` — 관심은 행 하나가 곧 상태다

`(user_id, deal_id)` 복합 PK가 유일한 불변조건을 쥔다 → **RPC가 필요 없다**(아래 "카운터가 없으면 쓰기 RPC도 없다"). 훅이 insert/delete를 직접 보낸다.

- SELECT·INSERT·DELETE 정책이 전부 `to authenticated` + 본인 행만이고, **UPDATE 정책은 없다**
  — 관심 행은 불변이다(표를 다른 딜로 옮기는 경로가 닫힌다. 빼기는 delete뿐).
- 목록 select의 `transfer_deal_watch(user_id)` 임베딩 — SELECT 정책이 "내 행만"이라 **배열
  길이가 곧 `isWatched`** 다(아래 PostgREST 임베딩 절). 비로그인은 정책이 `to authenticated`라 빈 배열.
- 같은 딜을 두 번 담는 것(23505)은 **성공으로 흡수한다**(멱등 — 아래 "설명과 흡수" 표).
- `created_at`은 INSERT grant 목록 밖이다(시각 위조 차단 — `rls.sql`의 INSERT 시점 위조 검사가 지킨다) — `default now()`가 채운다.
- ⚠ **anon에도 `(user_id, deal_id)` SELECT를 연다.** 행을 막는 것은 정책(`to authenticated`)이고 grant는 **임베딩의 통로**다. grant를
  빼면 목록 select의 관심 임베딩이 42501로 죽어 비로그인에게 보드가 통째로 안 보인다 —
  anon은 정책에서 걸려 항상 빈 배열(= `isWatched` false)을 받을 뿐이다.
- 딜이 지워지면(`report_count`가 0이 된 재파생) 관심도 함께 사라진다(`on delete cascade`).

### `transfer_club_follow` — 응원 구단은 관심과 같은 형태다

`(user_id, club_code)` 복합 PK · 본인 행만 SELECT·INSERT·DELETE · UPDATE 정책 없음 · 23505는 흡수 · `created_at`은
INSERT grant 밖 — 전부 `transfer_deal_watch`와 같고, RPC가 없는 이유도 같다(카운터가 없다).

- ⚠ **anon에는 SELECT grant조차 없다**(관심과 다른 점). 관심은 공개 목록 select에 임베딩되어 grant가 통로였지만,
  응원 구단은 로그인 사용자의 전용 조회(`buildFollowedClubsQuery`)로만 읽는다 → 세션이 실린 클라이언트로만 부른다.
- 조회는 유저 필터를 걸지 않는다 — SELECT 정책이 "내 행만"이라 필터가 곧 정책이다(관심 임베딩과 같은 구조).
- 구단 FK가 `transfer_club`을 잡는다 → 그 표에 5대 리그 구단이 전부 있어야 고를 수 있다(`transfer-pipeline.md` 딜 파생 절의 "구단").
- 읽는 쪽: 보드(구단 칩의 순서)와 알림 발송(그 구단이 걸린 딜의 소식을 받을 사람).

### 웹 푸시 — `profiles_push_subscription`(사용자 쓰기) · `transfer_deal_push_log`(운영 기록)

**구독은 기기 하나다(PK가 `endpoint`).** 사용자는 자기 행만 INSERT·DELETE하고, SELECT는 `endpoint`·`user_id`뿐이다 —
클라이언트가 확인하는 것은 "이 기기의 구독이 내 것인가" 하나이고 암호화 키(`p256dh`·`auth`)는 발송만 읽는다.

- ⚠ **구독은 계정이 아니라 브라우저의 것이다.** 같은 브라우저에서 계정이 바뀌면 그 endpoint는 앞 사람의 행이 쥐고
  있어 새 사람의 INSERT가 23505다 → 클라이언트가 그 전에 브라우저 구독을 새로 받아 endpoint를 바꾼다
  (`usePushToggle`). UPDATE 정책을 두지 않아 구독을 남에게 넘기는 경로가 없다.
- ⚠ **죽은 구독은 발송이 지운다.** 브라우저가 구독을 버리면(로그아웃·권한 회수·앱 삭제) 세션이 없어 그 행을 지울
  사람이 없다 → 푸시 서비스가 404·410을 준 행을 스크립트가 지운다. ⚠ 그 밖의 거부(401·403)에서는 지우지 않는다 —
  우리 쪽 키 설정 실수 한 번에 구독 전부가 사라진다.
- ⚠ **`endpoint`는 스크립트가 요청을 보내는 주소이고 사용자가 쓴 값이다.** DB는 모양(`https://호스트[:포트]/경로`)과
  길이만 보고, 아는 푸시 서비스의 호스트인지는 보내는 쪽(`pushEndpointUrl`)이 판정한다 — DB가 호스트 목록을 쥐면
  브라우저가 새 푸시 서비스를 쓰기 시작한 날 구독이 등록되지 않는다.
  - ⚠ **호스트 자리의 글자를 좁힌다(영숫자·점·하이픈) — DB도, 보내는 쪽도.** 호스트를 검사하는 파서(`new URL`)와
    발송 라이브러리가 접속에 쓰는 파서(Node의 옛 `url.parse`)가 다르다. `https://evil.example;.push.apple.com/x`는 앞의
    파서에게 `…push.apple.com`으로 끝나는 호스트이고 뒤의 파서에게는 `evil.example`이다 — 호스트 목록만 대조하면
    통과해 엉뚱한 서버로 요청이 간다. 보내는 쪽은 통과한 주소를 **정규화한 값으로만** 보낸다(검사한 문자열 = 보내는 문자열).
  - 발송 한 건에는 전체 시간 상한이 있다 — 응답을 조금씩 흘려 소켓을 살려 두는 서버가 발송 워커를 붙잡지 못하게.
- ⚠ **한 계정의 구독 수는 트리거가 묶는다**(`profiles_push_subscription_prune` — 넘치면 가장 오래된 것부터 걷어 낸다).
  발송이 구독 행마다 요청을 보내므로 상한이 없으면 한 계정이 발송 시간을 독점한다. **거부하지 않고 지우는 이유**는
  죽은 구독이 그 사람에게 알림이 갈 때에만 정리되기 때문이다 — 거부하는 상한이면 기기를 여러 번 바꾼 사용자가 영영
  켜지 못한다. 보내는 쪽도 같은 수에서 한 번 더 자른다(이중 방어).
- ⚠ **1:N 조회는 끝까지 읽는다**(`notify.mjs`의 `selectIn`). 딜 하나에 관심이 여럿, 사용자 하나에 구독이 여럿이라
  응답 한 번이 `max_rows`에서 조용히 잘리면 그 뒤의 사람들에게 알림이 가지 않는다 — 에러도 로그도 없이.
- `endpoint`·`p256dh`·`auth`는 **브라우저가 만든 값**이라 아래 길이 한도 표의 대상이 아니다(사용자가 입력하는 칸이
  없다). DB의 형식 CHECK에 걸리면 훅이 일반 문구 대신 "등록하지 못했어요"로 말한다(`usePushToggle`).
- 저장의 23505는 **내 행이면 흡수**한다(두 탭에서 동시에 켰다) — 아래 "설명과 흡수" 표.

**발송 기록(`transfer_deal_push_log`)은 (딜, 이적 창, 상태 톤)마다 한 행이다** — 같은 창 안에서 같은 딜의 같은 상태를 두 번 알리지 않는다.
writer는 수집 스크립트 하나이고 쓰기 정책도 grant도 없다(아래 "운영진만 쓰는 데이터").

- ⚠ **창(`round_key` — 알린 시점에 추적하던 창, `trackedWindowKey`)이 키에 든다.** 딜 id는 선수당 영구라, 창이 없으면 여름 임대 오피셜을
  알린 선수의 다음 해 완전 이적 오피셜이 같은 키에 걸려 영영 가지 않는다.
- ⚠ **문맥 보도만으로 바뀐 변화(`contextOnly`)는 알리지 않는다** — 진행 중인 임대의 설명은 새 움직임이 아니다(`transfer-pipeline.md` 딜 파생의 임대 절).
- **결과가 난 딜의 형태가 바뀌면 같은 톤이어도 알린다**(`formChanged` — 임대 오피셜 → 완전 영입 전환 오피셜). 문맥 보도로 조용히 오피셜이 된 딜에 전환
  오피셜이 오면 단계가 그대로라 가장 큰 소식이 빠졌다. ⚠ 저장된 형태가 있을 때만 센다 — 형태 컬럼이 처음 채워지는 실행은 소식이 아니다. 같은 창에서
  같은 톤을 이미 알린 딜은 발송 기록(딜, 창, 톤)에 걸려 다시 가지 않는다.
- 알림 제목은 형태의 말을 이름 뒤에 붙인다("오피셜 · 가르나초 임대" — `FORM_NOUN`). 화면(`deal-form.ts`의 `DEAL_FORM` noun)의 사본이고
  테스트가 대조한다.

- ⚠ **알리는 것은 "이번 실행의 변화"뿐이다** — `writeDeals`가 저장된 값과 새 값의 차이에서 만든 `changes`만 본다.
  기록만 보고 만들면 처음 켠 날 보드의 모든 딜이 "아직 안 알린 딜"이 된다.
- ⚠ **기록을 먼저 넣고 보낸다**(충돌은 무시, 새로 들어간 것만 발송). 보내다 죽어도 다음 실행이 다시 보내지 않는다 —
  알림은 한 번 덜 가는 편이 두 번 가는 것보다 낫다.
- ⚠ **상태는 단계가 아니라 화면의 톤이다**(뱃지가 그리는 갈림). 같은 톤 안의 이동은 화면에서 달라지는 것이 없어
  알리지 않는다. 톤은 enum(`transfer_status_tone`)이고 화면의 `TransferStatus` 타입이 거기서 생성된다 — 톤이 늘면
  화면의 라벨·뱃지 맵이 컴파일 에러로 드러난다. 스크립트의 톤 표·경로 문구는 화면(`entities/transfer/lib/stage.ts`·
  `route-label.ts`)의 사본이고 `scripts/test-transfer-notify.mjs`가 대조한다.
- ⚠ **사람이 돌리는 재처리에서는 알리지 않는다**(`--reprocess`·`--derive-only`…). 규칙을 고친 뒤의 일괄 변화는
  소식이 아니다 — 정기 실행만 알린다. 한 실행의 변화가 상한을 넘으면 **확정된 소식(오피셜·합의 완료)부터** 상한만큼만
  보내고 나머지는 기록만 한다 — 통째로 버리면 이적 마감일처럼 진짜 소식이 몰리는 시간에 아무것도 가지 않는다.
- 받는 사람: 관심 등록자는 그 딜의 모든 상태 변화, 응원 구단 팬은 새 딜과 큰 진전(합의 임박·합의 완료·오피셜)만. 응원 구단은 출발·행선지·관심 구단에 더해 **지금 임대로 뛰는 구단**도 센다 — 그 구단에서 뛰는 선수의 이적설은 그 팬의 일이다(보드의 구단 필터와 같은 판정).
  결렬·부인까지 구단 팬에게 보내면 소음이 된다 — 그래서 **처음부터 결렬·부인으로 열린 딜은 아무에게도 알리지 않는다**(담은 사람도 아직 없다).
- **개별 발송의 실패는 경고다**(기기가 꺼져 있다 · 푸시 서비스가 잠깐 죽었다) — 딜은 이미 저장됐다. VAPID 키가 없으면
  발송을 건너뛴다. ⚠ **설정이 틀려 아무것도 가지 않는 경우는 종료 코드 1이다**: 키 형식 오류(기록을 넣기 **전에**
  검증한다 — 넣은 뒤에 던지면 그 알림들이 영영 나가지 않는다) · 푸시 서비스의 인증 거부(401·403 — 공개키가 앱 빌드의
  것과 다르다) · 기록 실패. 경고로만 두면 알림이 한 건도 가지 않는 채로 작업이 초록이다.
- ⚠ **딜을 저장한 뒤의 실패에도 알림은 보낸다.** `writeDeals`는 딜 저장 뒤 단계(관심 구단·보도 배정·빈 딜 정리)가
  던지면 변화 목록을 에러에 실어 던지고, 호출부가 그것으로 마저 보낸다 — 딜은 이미 새 단계라 다음 실행에는 차이가 없다.

### `transfer_deal_comment` — 딜 댓글 · 좋아요/싫어요

딜에 딸린 사용자 글이다. 읽기 공개(비로그인·크롤러 포함) ·
쓰기/삭제 본인만 · **수정 경로 없음**(UPDATE 정책도 grant도 없다).

- **딜 FK는 `on delete restrict`다(관심의 cascade가 아니다).** 딜은 파생 스크립트가 다시 만들고 지우는
  데이터라 cascade면 재파생 한 번에 사용자 글이 사라진다 → 파생기가 댓글 달린 딜을 삭제 대상에서 뺀다(위 "이적시장 데이터는 보도에서 파생한다" 절).
- **답글은 깊이 1** — `transfer_deal_comment_check_depth`(BEFORE INSERT)가 부모가 답글이거나·다른 딜이거나·없으면
  P0001로 사유를 말한다. 정책이 아니라 트리거인 이유는 아래 "그래서 검증 로직을 정책이 아니라 트리거에 두는 경우" 절.
  ⚠ 이 트리거는 **invoker**이고 첫 줄 명의 검사를 **두지 않는다** — 말하는 값(부모의 딜·깊이)이 전부 공개 SELECT다
  (아래 "트리거는 정책이 통과시킬 행에 대해서만 말한다"의 예외).
- **루트를 지우면 남의 답글까지 cascade로 사라진다** — 화면의 삭제 확인이 "답글 N개도 함께 삭제돼요"로 알린다.
- **표는 `transfer_deal_comment_vote(user_id, comment_id, value ±1)` 한 행**이다. 복합 PK가 "1인 1표"를 쥐고, 바꾸기는
  `value` UPDATE(grant가 그 컬럼 하나뿐 — 표를 다른 댓글·사람으로 옮길 수 없다), 거두기는 delete다. upsert는 쓰지 않는다.
- **합계(`up_count`·`down_count`)는 definer 트리거(`sync_transfer_deal_comment_vote_count`)가 단독 관리한다** — 표가
  남의 댓글에 붙으므로 호출자 권한으론 UPDATE할 수 없고, 탈퇴 cascade도 숫자를 맞춰야 한다(아래 "비정규화 카운터" 절).
  RPC가 없는 이유는 분기(insert/update/delete)를 클라이언트가 해도 불변조건이 PK·트리거에 있어 어긋날 값이 없어서다.
- 목록 select의 `transfer_deal_comment_vote(value)` 임베딩이 곧 **내 표**다(관심과 같은 트릭 — 정책이 "내 행만").
  ⚠ 그래서 anon에도 `(user_id, comment_id, value)` SELECT를 연다(임베딩의 통로).
- 작성자 표기는 `profiles` 임베딩이다 → 닉네임·아바타를 바꾸는 훅이 댓글 캐시도 무효화한다.

### 딜 성사 예측 — "이번 창 안에 오피셜이 뜰까?"

딜 상세의 원탭 투표와 그 채점(예측 랭킹)이다. 표마다 writer가 다르다 — 아래 표가 전부다.

| 표 | 무엇 | writer |
|---|---|---|
| `transfer_window` | 이적 창 일정의 DB 사본(리그별 일정을 합친 기간) | 파생 스크립트(`syncWindows` — `windows.json`에서 맞춘다, 지우지 않는다) |
| `transfer_deal_prediction` | 내 예측 — `(user_id, deal_id, round_key)` 복합 PK가 "한 창에 한 딜당 한 표" | 사용자(자기 행만 SELECT·INSERT·UPDATE(`will_happen`)) |
| `transfer_deal_prediction_tally` | 딜·회차별 성사·불발 표 수 | definer 트리거(`sync_transfer_deal_prediction_tally`) |
| `transfer_prediction_score` | 사람별 점수·적중·채점 수·순위 | 파생 스크립트(`runScoring` — 매시 처음부터 다시 채점, 바뀐 행만 쓴다) |
| `transfer_deal_round_result` | 판정이 끝난 회차의 딜 결과(그 회차 안의 결과 시각, 없으면 불발) | 파생 스크립트(`runScoring`의 `freezeRoundResults` — 한 번 적은 행은 고치지 않는다) |

- **회차(`round_key`)와 시각(`voted_at`)은 트리거가 정한다**(`transfer_deal_prediction_open`) — 둘 다 INSERT grant 밖이다.
  회차 = 표를 던진 순간 **아직 닫히지 않은 가장 이른 창**이다(창 사이에 던진 표는 다음 창의 표). 클라이언트가 회차를 보내면
  마감된 창에 표를 넣을 수 있고, 시각을 보내면 결과 전에 던진 것처럼 꾸밀 수 있다. 그래서 DB가 창 일정의 사본을 갖는다
  (단일 소스는 여전히 `windows.json`이고 채점도 그 JSON을 읽는다 — 사본은 트리거 전용이다).
  ⚠ `round_key`의 기본값 `''`는 트리거가 덮는 자리 채움이다 — 기본값이 없으면 생성 타입이 그 컬럼을 Insert 필수로 만든다.
  다음 창 일정이 비어 있으면 P0001로 거부한다 → **시즌마다 `windows.json`을 갱신하는 것이 투표를 여는 일이기도 하다.**
- **투표는 단계로 닫힌다** — 딜이 합의 완료·오피셜이면 insert·update가 P0001이다. 결렬·부인은 되살아날 수 있어 열어 둔다.
  마감된 회차의 표도 바꿀 수 없다(`transfer_deal_prediction_change`). 같은 값으로의 UPDATE는 시각을 건드리지 않는다
  (다시 누른 것으로 "결과 뒤의 표"가 되면 안 된다). 두 트리거는 invoker이고 명의 검사를 두지 않는다 — 말하는 값(딜 단계·창 일정)이
  전부 공개 SELECT다(댓글 깊이 트리거와 같은 예외).
- ⚠ **거두기(DELETE)가 없다** — 정책도 grant도 없다. 지울 수 있으면 틀릴 것 같은 표를 결과 직전에 거둬 적중률을 지키는
  길이 열린다. 바꾸기만 된다.
- ⚠ 딜 FK는 **restrict**다(댓글과 같다) — 파생기가 예측 걸린 딜을 삭제 대상에서 뺀다(위 "이적시장 데이터는 보도에서 파생한다" 절).
- 남의 표는 보이지 않는다(SELECT 정책이 "내 행만") — "팬 N%"는 집계 표로만 그린다. anon에도 SELECT grant를 연다(통로 —
  정책이 `to authenticated`라 빈 결과). 집계는 탈퇴 cascade에도 트리거가 돌아 맞는다.
- **채점**(`scripts/lib/transfer/predictions.mjs`가 단독으로 갖는다): 회차의 판정 시각 = 창 마감 + `SETTLE_GRACE_MS`(2일 — 마감일
  등록 이적의 발표 지연). 딜의 `settled_at`이 판정 시각 이전이면 성사, 아니면 판정 시각이 지났을 때 불발, 그 전엔 미정이다.
  ⚠ 성사된 딜에서 **결과 시각 이후에 던진(바꾼) 표는 채점하지 않는다** — 투표는 단계로 닫히지만 파이프라인 지연(최대 1시간)
  사이에는 열려 있어, 소식을 보고 고른 표를 거른다. 맞힌 표는 `max(1, round(100 × (1 − 같은 쪽 표 / 전체 표)))`점(소수 의견
  가중 — 모두가 무산을 점치는 루머에 몰아서 "불발"을 찍는 점수 쌓기가 통하지 않는다), 틀린 표는 0점. 순위는 점수의 경쟁
  순위(1, 2, 2, 4)다. 채점된 표가 한 건 이상인 사람만 점수 행이 있다.
- ⚠ 채점은 **누적하지 않고 매번 처음부터** 다시 한다 — 규칙을 고치거나 표가 사라져도 다음 실행에 맞는다. 그래서 파생이
  실패한 실행에서도 다음 실행이 따라잡는다. 채점 실패는 종료 코드 1이다(랭킹이 멎어도 화면은 옛 점수를 그대로 그린다).
- ⚠ **다만 판정이 끝난 회차의 결과는 한 번 굳힌다**(`transfer_deal_round_result`). 딜은 선수당 하나라, 여름 창에 오피셜이 난 선수에게
  다음 창의 파생 범위에서 보도가 하나라도 생기면 같은 딜이 새 창의 보도만으로 다시 파생되어 `settled_at`이 지워진다 — 지금의 값으로
  지난 회차를 다시 읽으면 "성사" 적중이 소급해 불발이 되고 "불발" 표가 적중이 됐다. 판정 시각 + `RESULT_FREEZE_MS`(7일 — 판정 시각
  직전에 게시된 오피셜 보도가 판정을 늦게 받아도 잡히게)가 지난 (딜, 회차)마다 그때의 결과를 적고, 그 뒤로는 그 값으로 채점한다(표의
  판정·점수 계산은 여전히 매번 처음부터다). ⚠ 확정 유예는 **다음 창의 파생 범위가 시작되기 전에** 끝나야 한다 —
  `test-transfer-predictions.mjs`가 `windows.json`의 창마다 대조한다. 같은 창 안에서 결과가 난 앞 사건 뒤 새 사건이 시작되는 경우(`transfer-pipeline.md` 딜 파생의 임대 절)는
  판정 시각 전의 일이라 이 장치 밖이다.

## ⚠ RLS + 컬럼 권한이 유일한 방어선

중간 검증층(Route Handler)이 없다. **정책 하나만 빠뜨려도 즉시 프로덕션 구멍**이다.

- **컬럼 권한은 선택이 아니라 필수다.** "본인 행만 UPDATE" 정책만 두면 작성자가 자기 행의 카운터 컬럼을 9999로 UPDATE하는 게 통과한다(실측). 카운터·타임스탬프는 `revoke` 후 필요한 컬럼만 `grant`한다.
- **UPDATE 정책에는 `with check`를 반드시 함께 둔다.** 없으면 소유자 컬럼을 남의 uuid로 바꾸는 소유권 이전이 가능하다.
- **클라이언트 검증은 UX이지 방어가 아니다.** 길이 제한은 DB `check` 제약으로도 반드시 건다. ⚠ 단 **화면 한도와 DB 한도는 단위도 값도 다르다** — 아래 "길이 한도는 두 단위로 겹쳐 건다".
- `(select auth.uid())`로 감싼다 — 행마다 재평가되지 않고 InitPlan으로 승격되어 쿼리당 1회 평가된다(Supabase 공식 성능 권고).
- 정책을 고치면 **`bash supabase/tests/run-rls.sh`를 돌린다**(`rls.sql`을 직접 `psql`로 돌리지 말 것 — 래퍼가 결과를 양방향으로 대조해 준다). 실패를 기대하는 검사마다 savepoint를 쓴다(없으면 첫 에러가 트랜잭션을 abort시켜 뒤쪽 검사가 전부 무의미해진다).

### RLS 위반은 에러가 아니라 0행이다

UPDATE/DELETE의 `using` 절은 **필터로 동작**한다 → 권한이 없으면 에러 없이 0행이 지나간다. 훅에서 `.select()`를 붙여 영향 행 수를 확인하고 0이면 에러로 승격해야 "수정됐다"고 거짓말하지 않는다.

```ts
const { data, error } = await supabase.from("profiles")
  .update({ nickname }).eq("id", userId).select("id");
if (!error && data.length === 0) throw new Error("수정 권한이 없거나 없는 프로필이에요.");
```

⚠ 단 **SELECT 권한이 없는 테이블에는 `.select()`를 붙이지 않는다** — 붙이면 쓰기 자체가 42501이 된다.

## ⚠ CHECK 제약 안의 함수는 **호출자 EXECUTE 권한**으로 평가된다

`has_visible_char`를 만들고 다른 함수들처럼 `revoke execute from public, anon, authenticated`를
걸었더니 **그 CHECK가 걸린 테이블의 쓰기가 전부 `42501 permission denied for function has_visible_char`로 막혔다**(실측).

RPC(`security definer`, 호출자가 직접 부른다)와 성질이 다르다 — 제약 평가 함수는 **쓰기 권한이
있는 역할이 EXECUTE도 가져야 한다.** 노출이 걱정되면 함수가 입력 외의 정보를 돌려주지 않게
설계하고 열어라(`has_visible_char`·`normalize_nickname`·`is_plain_nickname` 모두 그렇다).

### 그래서 검증 로직을 정책이 아니라 **트리거**에 두는 경우가 있다

RLS의 `with check` 안에서 부르는 함수도 **똑같이 호출자 EXECUTE 권한으로 평가**된다. 즉
"정책에 넣고 함수는 revoke"라는 조합은 성립하지 않는다 — revoke하는 순간 그 테이블의 쓰기가 전부 42501로 죽는다.

- 그런 검증은 insert 정책이 아니라 **before insert 트리거**에 둔다.
- 부수 효과로 **에러 메시지가 좋아진다.** 정책 위반은 Postgres의 영어 42501뿐이라 "왜 거부됐는지"를 설명하지 못하는데, 트리거는 `P0001`로 한국어 사유를 그대로 노출한다(`toDbErrorMessage`가 P0001을 통과시킨다).
- 판단 기준: **거부 사유를 사용자에게 설명해야 하면 트리거**, 단순 접근 차단이면 정책.
- 중복 거부를 유니크 제약에만 맡기면 **23505가 `toDbErrorMessage`에서 닉네임 문구인 "이미 사용 중인 값이에요."로 접혀** 뜻이 어긋난다 — 사유를 말해야 하는 중복은 트리거(또는 함수)가 P0001로 직접 던진다.

#### ⚠ 트리거는 **정책이 통과시킬 행에 대해서만** 말한다

**BEFORE ROW 트리거는 RLS `with check`보다 먼저 돈다**(`ExecInsert`: BR 트리거 → WCO).
그래서 트리거가 정책이 어차피 거부할 행에까지 사유를 말하면 **에러 코드가 오라클이 된다** —
`P0001`(조건 성립) vs `42501`(불성립)로 갈리기 때문이다.

실제로 신고 테이블이 그랬다. 컬럼 grant에 신고자 컬럼이 있어 payload에 실을 수 있고
`profiles`의 uuid는 전부 공개이므로, **남의 uuid를 실어 insert를 시도하는 것만으로**
"그 사람이 이 글을 신고했는가"와 "이 글의 작성자가 누구인가"가 읽혔다(실측 — HTTP 400/403으로 갈렸다).
트리거가 `security definer`라 `exists`가 RLS를 넘어 읽으므로 **아무에게도 보이지 않는 행까지**
특정됐다. SELECT 정책을 일부러 두지 않아 감춘 테이블이 에러 채널로 통째로 새어 나간 셈이다.

→ **트리거의 첫 줄은 "이 행이 정책을 통과할 명의인가"를 확인하고, 아니면 판정을 정책에 넘긴다.**

```sql
if new.<owner_column> is distinct from (select auth.uid()) then
  return new;   -- 아무 말도 하지 않는다 → 42501 하나로 수렴
end if;
```

⚠ AFTER INSERT로 옮겨 해결하지 않는다 — 그러면 유니크 제약이 먼저 발화해 중복이 `23505`로 나가고,
`toDbErrorMessage`가 닉네임 문구로 접어 **트리거를 택한 이유 자체가 무너진다.**
⚠ 이 회귀는 라벨만으로는 안 잡힌다 — `run-rls.sh`는 "차단 기대인데 통과했는가"만 보고
**어떤 코드로 차단됐는지는 보지 않는다.** `rls.sql`에서 sqlstate를 직접 찍어 대조한다.

⚠ **예외: 트리거가 말하는 값이 전부 공개 SELECT로 읽히는 값이면 명의 검사를 두지 않는다**(댓글 깊이 트리거).
감춘 것이 없으면 오라클도 없고, 명의 검사는 `auth.uid()`가 비는 service_role·마이그레이션 경로에서 검사를 통째로 끈다.

#### ⚠ 같은 23505라도 "설명"과 "흡수"로 갈린다

판정 기준은 **재시도가 목표 상태에 이미 도달했는가**다.

| 자리 | 처리 | 왜 |
|---|---|---|
| 관심 담기(`transfer_deal_watch`) · 응원 구단 고르기(`transfer_club_follow`) | 훅이 23505를 **성공으로 흡수** | 이미 담은 딜·고른 구단을 또 누르면 목표 상태 그대로다 — 멱등이 맞다 |
| 알림 켜기(`profiles_push_subscription`) | 그 주소가 **내 행이면 흡수**, 남의 행이면 구독을 버리고 "등록하지 못했어요" | 두 탭에서 동시에 켜면 같은 구독이 두 번 저장된다 — 내 행이 이미 있으면 목표 상태다. 남의 행이면 그 주소로는 켤 수 없다(구독을 새로 받아야 한다) |
| 댓글 표 던지기(`transfer_deal_comment_vote`) | 훅이 23505를 받으면 **`value` UPDATE로 이어 간다** | 다른 탭이 이미 표를 던졌다 — 목표 표로 맞추면 된다(흡수의 변형: 행은 있으니 값만 수렴시킨다) |
| "접수했어요"류 쓰기 | 트리거가 **P0001로 설명** | 같은 접수를 두 번 "접수했어요"라고 말하면 거짓말이다 |

⚠ 트리거는 BEFORE라 **동시 요청 두 건이 둘 다 통과하는 창**이 남는다. 그 창은 복합 PK가 막고(23505), 훅이 그 코드를 같은 한국어 문구로 접는다. **트리거는 "설명", 제약은 "보장"**이라 둘 다 필요하다.

## 닉네임은 **랜덤 배정 후 사용자가 바꾼다**

가입 시 `random_nickname()`이 축구 테마 조합(수식어+명사, 480가지)을 배정하고, 사용자가
프로필 화면에서 바꾼다. **프로바이더 표시 이름은 읽지 않는다.**

한때 `raw_user_meta_data`의 표시 이름을 base로 썼는데 세 가지가 걸렸다:

- 사용자가 카카오/구글 프로필을 바꾸면 우리 닉네임과 어긋난다
- 표시 이름이 실명인 경우가 많아 **화면에 실명이 노출된다**
- 무엇보다 base가 **클라이언트가 정하는 값**이라 사칭 방어를 계속 짊어져야 했다
  (실제로 제로폭 문자로 `alice`를 흉내내는 구멍이 열렸다 — 아래 정규형이 그 대응이다)

⚠ 충돌 시 접미사(`-2`)를 붙이지 않고 **다시 뽑는다.** 랜덤이라 재시도가 자연스럽고
`왼발의마법사-2`보다 다른 조합이 낫다. 20회 넘게 부딪히면 그때 임의 접미사를 붙인다.

🔴 **그 폴백 접미사에 허용 문자 밖의 글자를 쓰지 않는다.** 한때 `-` + md5였는데 아래
문자 집합이 하이픈을 거부하므로, 그대로 두면 480조합이 포화되는 순간부터 **그 사용자의
가입 자체가 영구히 실패한다** — 재시도 루프 안이라 무한 루프가 되는 형태다. 포화될
때까지는 아무 증상이 없어 배포 뒤 한참 지나 터진다.
→ `rls.sql`의 닉네임 검사가 **실제로 500명을 연속 가입시켜 포화**시키고(실측 폴백 25회 발동)
  그 값들이 CHECK를 통과하는지 본다. 표현식을 복제해 검사하지 않는 이유가 이것이다 —
  폴백은 트리거 내부라 복제하면 트리거를 고쳤을 때 검사만 옛 표현식을 통과시킨다.
  ⚠ 같은 검사가 **폴백이 실제로 발동했는지**도 함께 증명한다 — 그 값이 0이 되면 포화 검사는
  폴백을 전혀 보지 못한 채 통과하는 셈이다.

### 닉네임 정규형 — 사용자가 고칠 수 있게 되면서 필수가 됐다

`normalize_nickname()`이 보이지 않는 문자를 지우고, 빈 자리를 그리는 문자(NBSP·전각공백)를
보통 공백으로 접고, 연속 공백을 하나로 만든 뒤 **NFC로 정규화한다.** 앞 세 단계의 문자
집합은 `has_visible_char`의 클래스를 **둘로 쪼갠 것**이고 합집합이 원본과 같아야 한다
(한쪽만 고치지 말 것).

⚠ **NFC는 아래 문자 집합과 한 쌍이다.** 없으면 자모 분해형 한글(U+1112 U+1161 U+11AB = '한')이
`가-힣` 범위를 벗어나 거부되는데, 그 형태는 macOS에서 복사한 한글로 실제로 들어온다 →
사용자에게는 "한글인데 왜 안 되지"가 된다.

⚠ **NFKC가 아니다.** NFKC는 전각 `Ａ`를 `A`로, `①`을 `1`로 접는다 — 사용자가 입력하지 않은
글자가 저장되는 데다, 전각을 반각으로 접는 순간 아래에서 막으려는 **동형이의 입력이
통과해 버린다.**

- `profiles_nickname_canonical` CHECK가 정규형이 아닌 값을 거부한다 →
  `lower(nickname)` 유일성이 **실제 유일성**이 된다(제로폭으로 우회 불가).
- `profiles_normalize_nickname` **트리거**가 쓰기 직전에 정규화하므로, 사용자가 공백을 붙여
  보내도 CHECK 위반(23514)이 아니라 조용히 다듬어진다.
- ⚠ **`normalize_nickname`은 닉네임 전용이 아니다.** 이름이 첫 호출자를 기록할 뿐 하는 일은
  "보이는 텍스트의 정규형"이라, **화면에서 구분되어야 하는 값**(유일해야 하는 라벨 등)은 전부 이걸로
  접는다. 접지 않으면 `unique`가 제로폭 문자·NBSP·꼬리 공백으로 **그냥 우회되어** 똑같이 생긴
  값이 여럿 저장된다.
  ⚠ 클라이언트 짝(`normalizeNickname`)도 **같은 자리에서 함께** 걸어야 한다. 한쪽만 접으면
  화면이 보여준 문구와 저장값이 갈린다.

### 닉네임 허용 문자 — **한글·영문·숫자만**

`is_plain_nickname()`이 `가-힣` · 한글 자모 `ㄱ-ㅣ`(U+3131–U+3163) · `A-Za-z` · `0-9`만
통과시키고, `profiles_nickname_plain` CHECK가 그걸 강제한다. **공백도 받지 않는다.**

제약 없이 뒀을 때 실제로 통과했던 값들(실측): `손흥민⚽` · `손 흥민` · `漢字 カナ Ωλ` ·
`<script>alert(1)</script>`.

- **정규형이 못 막던 마지막 사칭 벡터가 여기서 닫힌다.** 정규형 강제가 제로폭·NBSP 우회를
  막았지만 키릴 `а`(U+0430)·전각 `Ａ`(U+FF21)는 통과해서 라틴 글자와 **화면에서 구분되지 않는**
  닉네임을 만들 수 있었다. 허용 집합을 열거하면 그 클래스 전체가 사라진다
  (`has_visible_char`가 약칭에 기대지 않고 문자를 전부 열거한 것과 같은 판단이다).
- ⚠ **자모 범위의 상한이 `ㅣ`(U+3163)인 것은 실수가 아니다.** 바로 다음 U+3164는 HANGUL
  FILLER로 화면에 아무것도 그리지 않는다 — 한 글자만 넓혀도 "보이지 않는 닉네임"이 돌아온다.
- ⚠ **`profiles_nickname_canonical`을 지우지 않는다.** plain이 통과시키는 값은 전부 정규형이라
  지금은 중복처럼 보이지만, plain은 **정책**이라 넓어질 수 있고(특수문자를 허용하기로 하는 순간),
  그때 canonical이 유일한 정규형 방어선으로 돌아온다.
  뜻이 다르다: canonical = 정규형(보안 불변식) / plain = 문자 집합(정책).
- ⚠ 클라이언트 짝은 `isPlainNickname`이고 **정규형에 적용한다.** 원본으로 판정하면 NFD 한글이
  거부되고, DB가 조용히 다듬는 꼬리 공백까지 에러가 된다.
- ⚠ **문자 집합을 넓히면 아래 길이 한도 절의 바이트 계산(btree 한도)을 다시 한다** — 지금 최악이 3바이트(한글)인 것이 그 계산의 전제다.

## 아바타는 **경로**로 저장한다

`profiles.avatar_path`에는 전체 URL이 아니라 `avatars` 버킷 안의 경로(`{user_id}/{uuid}.webp`)만
넣는다. 전체 URL을 저장하면 로컬(`127.0.0.1:64321`)과 원격(`*.supabase.co`)의 호스트가 달라
환경을 옮길 때마다 모든 행이 깨진다. URL 조립은 **`@/shared/config`의 `avatarUrl()`** 한 곳에서만
(버킷 URL 조립의 단일 소스가 `publicStorageUrl()`이고 `avatarUrl()`은 그것을 감싼다).

- ⚠ `profiles_avatar_path_own` CHECK가 **자기 폴더만** 허용한다. Storage 정책이 업로드를 막아도
  **이미 존재하는 남의 파일 경로는 참조할 수 있기** 때문에 두 겹으로 막는다.
- ⚠ **`starts_with`로는 부족하다**(실측). `{내 uuid}/../{남의 uuid}/x.webp`가 통과하고, URL을
  만드는 순간 브라우저 파서가 `..`를 정규화해 **남의 파일이 뜬다.** 아바타는 작성자 신원 표시라
  그대로 사칭 벡터가 된다 → 정규식으로 `{내 uuid}/{파일명}` **두 세그먼트**를 강제한다.
  (`rls.sql`의 프로필 검사가 경로 탈출·하위 폴더·확장자 없음을 전부 본다)
- **1계정 : 1프로필사진.** 교체는 `list()`로 내 폴더를 훑어 **전부 지운 뒤** 업로드한다.
  반대 순서(업로드 → DB → 옛 파일 삭제)로 두면 마지막 삭제가 실패할 때마다 고아가 쌓이고
  되돌릴 방법이 없다. ⚠ 지울 대상을 **캐시에서 받지 않는다** — 리페치가 실패하면 옛 경로에
  머물러 엉뚱한 파일을 지운다. 지운 뒤 업로드가 실패하면 `avatar_path`도 `null`로 맞춰
  "DB엔 있는데 파일이 없는" 불일치를 남기지 않는다.
- ⚠ 파일명은 업로드마다 새로 만든다(uuid). 같은 이름을 덮어쓰면 공개 URL이 그대로라
  브라우저·CDN 캐시 때문에 옛 사진이 계속 보인다.
- 버킷의 `file_size_limit`(2MiB)·`allowed_mime_types`가 **실제 방어선**이다 —
  클라이언트 리사이즈는 UX일 뿐 우회 가능하다(RLS와 같은 구조). `rls.sql`이 이 설정값까지 대조한다 —
  정책만 보면 이 값이 조용히 넓어져도 아무도 모른다.
- ⚠ 새 키 형식(`sb_secret_…`)을 스크립트에서 쓸 때는 **`apikey` 헤더를 함께** 보낸다
  (Authorization만 주면 storage가 JWT로 파싱하려다 `Invalid Compact JWS`로 죽는다).

### ⚠ 정책만 걷은 옛 버킷이 남아 있다 — `post-images` · `survey-images`

두 버킷의 스토리지 정책은 마이그레이션(`20260926000001_drop_community_survey_match.sql`)이 걷었지만
**버킷과 파일은 남아 있다.** 호스팅 Supabase는 `storage.buckets`·`storage.objects`의 직접 DELETE를
트리거로 막아("Use the Storage API instead") 마이그레이션에서 지우면 원격 적용이 통째로 실패한다.

- 더는 올릴 수 없지만 **공개 버킷이라 이미 올라간 파일의 공개 URL은 계속 열린다.** 대시보드
  (Storage)에서 비운 뒤 지운다.
- 스토리지 정리를 마이그레이션에 넣지 않는다 — 버킷·객체 삭제는 Storage API(대시보드·CLI)로 한다.

## 문자 검증은 클라이언트와 DB가 **같은 문자 집합**을 써야 한다

`char_length` 길이 제한과 `~ '[^[:space:]]'` 공백 검사만으로는 부족했다:

| 값 | 클라이언트 | DB(수정 전) |
|---|---|---|
| `U+FEFF`(BOM) 한 글자 | `.trim()`이 깎아 거부 | **통과** — `[:space:]`에 없다 |
| `U+200B`(제로폭 공백) | 통과 | 통과 |
| 이모지 121개 | **거부** — `.length`가 UTF-16 코드유닛 | 통과 — `char_length`는 코드포인트 |

결과: 제목이 **완전히 비어 보이는 행**이 실제로 만들어졌고(`<title>﻿ | 온더볼</title>`),
이모지 입력은 한도의 절반에서 막혔다. 방향이 양쪽으로 다 어긋난 셈이다.

→ 단일 소스를 둔다. `src/shared/lib/text.ts`의 `hasVisibleChar`·`codePointLength`와
   `public.has_visible_char`(마이그레이션 20260802000001)가 **같은 문자 집합**을 쓴다.
   한쪽만 고치면 다시 갈린다. `<input maxLength>`는 UTF-16을 세므로 길이 제한에 쓰지 않는다.

## 길이 한도는 **두 단위로 겹쳐 건다** — 화면은 그래핌, DB는 코드포인트

코드포인트로 세면 사용자가 한 글자로 보는 이모지가 여럿으로 세어진다(실측):

| 입력 | 그래핌 | 코드포인트(=`char_length`) |
|---|---:|---:|
| ⚽ | 1 | 1 |
| 👍🏽 · 🇰🇷 · ❤️ | 1 | 2 |
| 👨‍👩‍👧‍👦 · 🏴󠁧󠁢󠁳󠁣󠁴󠁿 | 1 | 7 |
| 👨🏻‍❤️‍💋‍👨🏽 | 1 | 10 |
| `a` + 결합악센트 50개 | **1** | **51** |

그래서 **사용자에게 보이는 한도는 그래핌**이다. 그런데 DB를 그 단위로
맞출 수는 없다 — PostgreSQL에 그래핌 분절이 아예 없고(정규식에 `\X` 없음), 손으로 근사한
함수를 CHECK에 넣으면 **유니코드 버전에 따라 경계가 바뀌어** 실질적으로 IMMUTABLE이 아니게 된다
(ICU 업그레이드 후 기존 행이 제약 위반 → dump/restore 실패).

⚠ **어떤 배수로도 완전 정합은 불가능하다.** 1그래핌의 코드포인트 수에 상한이 없기 때문이다
(표 마지막 줄). 그래서 그래핌 한도는 DB 한도를 함의하지 못한다.

→ **클라이언트가 두 한도를 겹쳐 검사한다.** 그러면 배수가 얼마든 "클라는 통과했는데
  DB가 23514로 거부"가 0이 된다. DB 값은 K=10배로 두는데, 정상 이모지 최악값이
  10코드포인트/그래핌이라 **실사용에서는 DB 한도가 먼저 걸리는 일이 없다.**

### 한도는 한 쌍으로만 존재한다 — `TextLimit` + `lengthOverflow`

두 값을 `MAX`·`MAX_CODEPOINT`로 따로 두면 **한쪽만 검사하기가 자연스러워진다.** 이 설계의
안전 속성 전체가 "둘 다 건다"에 달려 있는데, 빠뜨려도 컴파일·린트·`rls.sql` 어느 것도 못 잡는다.
그래서 한도를 `TextLimit`(`@/shared/lib`) 하나로 묶고 판정은 **`lengthOverflow`가 단독으로**
소유한다. `parsePostId`·`safeNextPath`와 같은 이유다 — 두 곳이 같아야 하는 규약은 함수 하나가 갖는다.

- ⚠ **그래핌 길이를 직접 재서 비교하지 않는다.** 반드시 `lengthOverflow(v, LIMIT)`.
- 검사 순서가 규약이다 — 그래핌을 먼저 봐야 일반 사용자에게 한도 숫자가 담긴 문구가 간다.
  코드포인트 초과 문구("너무 길어요")는 결합 문자를 쌓지 않는 한 도달할 수 없다.

| 자리 | 화면(그래핌, 클라 전용) | DB(코드포인트, CHECK) | 상수 | 검증 함수 |
|---|---:|---:|---|---|
| 닉네임 | 20 | 200 | `NICKNAME_LIMIT` | `validateNickname` (정규형 기준 + `isPlainNickname`) |
| 딜 댓글 | 300 | 3,000 | `COMMENT_LIMIT` | `validateComment` (`hasVisibleChar` + `lengthOverflow`, 앞뒤 공백을 걷은 **저장값**을 잰다) |

⚠⚠ **길이는 저장하는 값으로 잰다.** 저장 직전에 값을 접는 자리(`normalizeNickname`)가 있으면
**정규형을 재야** 화면 한도와 저장값이 갈리지 않는다. `normalizeNickname`이 ZWJ를 지우므로
가족 이모지(👨‍👩‍👧‍👦)는 저장 시점에 4자로 분해된다 — 원본으로 재면 그래핌 20개가 한도 40을
통과한 뒤 **80그래핌으로 부푼다**(실측). 접지 않고 저장하는 값은 원본을 잰다.

⚠ **이 표는 "클라이언트가 쓰는 컬럼"만 담는다.** 쓰기 경로가 없는 컬럼(운영 스크립트만 쓰는
`transfer_*`)은 DB CHECK만 둔다.
⚠ **클라이언트 쓰기 경로가 새로 열리면 그 순간 이 표의 대상이 된다.** 운영 전용 화면이라고
예외가 아니다 — 한도를 안 걸면 DB의 23514가 나가고 `toDbErrorMessage`가 "입력한 내용을 다시 확인해
주세요."로 접어 **어느 칸이 문제인지 말하지 못한다.** 화면 한도는 그 문구를 "N자까지예요"로
만드는 장치다.

⚠ **검증은 features 슬라이스가 소유하고 뷰는 문구만 받는다**(`features/update-profile`의
`validateNickname`). 한도 상수를 배럴로 내보내고 뷰가 분기를 직접 짜면 슬라이스마다 형태가 갈린다.

⚠ **아주 긴 본문형 컬럼은 그래핌을 도입하지 않을 수 있다.** 한도가 넓어 이모지가 체감되지 않는데
abuse bound를 10배로 푸는 대가가 크고, 20,000자 그래핌 계산이 **1.5ms로 코드포인트(0.1ms)의
14배**라 키 입력마다 돌릴 수 없다(120자는 0.011ms라 무해하다). 그때는 코드포인트 단일 값으로 둔다.

⚠ **DB 한도를 없애서 "어긋날 일을 없앤다"는 선택지는 없다.** 중간 검증층이 없어
이 CHECK가 유일한 실제 방어선인 데다, `profiles`는 `lower(nickname)` btree 유니크 인덱스를
갖고 있어 CHECK를 지우면 어긋남이 **btree 최대 키 크기(8KB 페이지 기준 2704바이트)로
자리를 옮길 뿐**이다 — 그것도 `toDbErrorMessage`가 모르는 영어 에러로.
닉네임 200코드포인트 × 최대 3바이트 = 600바이트 < 2704라 이 한도가 인덱스도 함께 지킨다
(허용 문자가 한글·영문·숫자뿐이라 최악이 3바이트다 — `profiles_nickname_plain`이 4바이트
문자를 애초에 거부한다. **문자 집합을 넓히면 이 곱셈도 함께 고친다**).

⚠ 화면 한도를 클라이언트만 강제하므로 **렌더도 방어해야 한다** — 우회 삽입된 긴 값이
카드를 늘리지 않게 `line-clamp`·`truncate`로 자른다. `generateMetadata`는 `clamp`가 막는다.

⚠ `random_nickname()`의 계약은 여전히 **20자**다(컬럼 상한 200이 아니다). 랜덤 배정된 닉네임도
사용자가 화면 한도 안에서 편집할 수 있어야 한다 — `rls.sql`의 랜덤 닉네임 길이 검사를 200으로 올리지 말 것.

검증은 `rls.sql`의 길이 한도 검사(경계 ±1 + 닉네임 200자가 `lower(nickname)` btree 인덱스에도 들어가는지)가 맡는다.

## SECURITY DEFINER 함수

쓰기가 RLS를 넘어야 할 때만 `security definer`로 내린다. `security definer` 함수의 **전량은 아래 표가 전부**다 — 새로 만들면 여기에 추가한다.

> 검증: `select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`
> — 표와 실제가 갈리면 **보안 표면 목록이 거짓이 된 것**이다.

| 종류 | 함수 | 비고 |
|---|---|---|
| 트리거 | **`handle_new_user`** (`on_auth_user_created`, `after insert on auth.users`) | 가입 시 `profiles` 행 생성. **호출자 권한으로 돌면 `profiles` insert 권한이 없어 가입 자체가 실패한다** |
| 트리거 | **`sync_transfer_deal_comment_vote_count`** (`after insert or update or delete on transfer_deal_comment_vote`) | 댓글 좋아요·싫어요 합계. 댓글에 UPDATE 정책도 grant도 없어 **호출자 권한으로 돌면 남의 댓글 합계가 0행으로 조용히 안 바뀐다** |
| 트리거 | **`sync_transfer_deal_prediction_tally`** (`after insert or update or delete on transfer_deal_prediction`) | 딜 성사 예측 집계. 집계 표에 쓰기 grant가 없어 **호출자 권한으로는 집계를 만들 수도 바꿀 수도 없다** — 탈퇴 cascade로 표가 사라질 때도 이 트리거가 숫자를 맞춘다 |

⚠ **아래는 definer로 오해하기 쉽지만 아니다.**
권한 없이도 도는 함수를 "RLS를 우회하는 함수"로 세어두면 보안 검토가 헛돈다. 위 검증 질의에서 `prosecdef = false`로 나오는 것이 전부이고, 아래 표는 그중 이유가 헷갈리는 것만 적는다.

| 함수 | 왜 definer가 아닌가 |
|---|---|
| `touch_updated_at` | 트리거지만 자기 행의 `updated_at`만 채운다 → 권한 상승이 필요 없다 |
| `normalize_profile_nickname` | 쓰기 직전 `new.nickname`을 다듬을 뿐이라 호출자 권한으로 충분하다 |
| `transfer_news_freeze_collected` | 트리거지만 옛 행과 새 행을 비교해 거부할 뿐이다 → 권한 상승이 필요 없다(writer가 service_role이라 **어차피 grant가 아니라 이 트리거가** 방어다) |
| `random_nickname` | 인자도 테이블 접근도 없는 순수 조합 생성기 |
| `transfer_deal_comment_check_depth` | 트리거지만 부모 댓글을 **읽기만** 하고, 댓글은 전부 공개 SELECT라 RLS를 넘을 이유가 없다 |
| `transfer_deal_prediction_open` · `transfer_deal_prediction_change` | 트리거지만 읽는 것(딜 단계·창 일정)이 전부 공개 SELECT이고, 바꾸는 것은 들어오는 자기 행(`new`)의 회차·시각뿐이다 |
| `profiles_push_subscription_prune` | 트리거지만 지우는 것이 **호출자 자신의 구독**뿐이다 — DELETE·SELECT 정책이 "내 행만"이라 호출자 권한으로 충분하고, definer로 올리면 남의 명의로 넣는 시도가 그 사람의 구독을 밀어낼 수 있게 된다 |

⚠ **CHECK 제약 평가 함수(`has_visible_char`·`normalize_nickname`·`is_plain_nickname`)는 이 목록의 대상이 아니다.**
성질이 반대다 — definer로 만들 게 아니라 오히려
**그 테이블에 쓰는 역할에 EXECUTE를 열어야** 한다(위 "CHECK 제약 안의 함수" 절).

definer 함수를 새로 만들 때의 규약:

- **유저 id를 인자로 받지 않는다.** `security definer`는 RLS를 우회하므로 유저를 클라이언트가 넘기면 남의 명의로 조작할 수 있다. 함수 안에서 `auth.uid()`로 확정한다 — PostgREST가 access token을 검증해 `request.jwt.claims`에 심어둔 값이라 위조가 불가능하다. `security definer`가 바꾸는 것은 "무엇을 할 수 있는가"(권한)이지 "누가 호출했는가"(세션 컨텍스트)가 아니다.
- **`set search_path = ''` + `public.` 접두사.** 호출자가 search_path를 조작해 다른 스키마의 동명 테이블을 붙잡게 만드는 권한 상승을 막는다.
- **definer 안에서는 정책이 닿지 않는다.** 소프트 삭제·권한 판정처럼 정책이 하던 거름을 **함수 안에서 직접** 한다.
- **정책으로 표현할 수 없는 규약은 유일 경로로 만든다.** 정책에는 시점 개념이 없어 "생성 시 고정"·"항목 2~4개" 같은 규약을 지키지 못한다 — 그 테이블의 정책·grant를 걷고 definer 함수 하나만 쓰기 경로로 남기면 그 함수가 규약을 **단독으로 소유**한다(실측: 정책을 열어 뒀더니 이미 표가 던져진 투표에 선택지를 끼워 넣을 수 있었다).
- **여러 행을 한 번에 바꾸는 함수는 세기 전에 잠근다.** "지우고 넣은 뒤 다시 센다"로는 막을 수 없다 — 자식 FK가 `on delete cascade`면 그 delete가 **경합으로 들어온 행까지 함께 지우고**, 재검사는 자기가 지운 증거를 찾다가 0을 본다(두 세션으로 실측). 세기 전에 `select … for update`로 잠근다 — 참조하는 insert가 `for key share`를 잡으므로 충돌해 기다리거나 23503으로 거부된다. ⚠ 이 회귀는 `rls.sql`이 잡지 못한다(두 세션이 필요한데 그 파일은 한 트랜잭션이다).
- **`revoke execute from public, anon`.** 함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다 — 그대로 두면 비로그인도 호출한다.
  - ⚠ **anon에 EXECUTE가 열린 함수는 아래 표가 전부**이고, 그게 `rls.sql` 전수 가드의 화이트리스트다.
    definer는 그중에 없다 — 새로 열 때 definer인지를 함께 적는다.

    | 함수 | definer? | 왜 열려 있나 |
    |---|:---:|---|
    | `has_visible_char` | — | **CHECK 제약 평가** — 닫으면 그 테이블의 쓰기가 전부 42501로 죽는다 |
    | `normalize_nickname` | — | 〃 (CHECK + before-write 트리거) |
    | `is_plain_nickname` | — | 〃 (`profiles_nickname_plain` CHECK) — 닫으면 가입과 닉네임 변경이 42501로 죽는다 |

  - ⚠ **anon은 어디에도 쓸 수 없다.** 비로그인 쓰기 경로를 여는 순간 그 값은 curl 루프로 부풀릴 수 있는 대략치가 된다 — 열어야 한다면 컬럼 주석에 신뢰 수준을 함께 적는다.
- **에러 코드 규약**: 우리가 의도적으로 띄우는 한국어 메시지는 **`P0001`** 로 던진다(`toDbErrorMessage`가 그대로 노출한다). `42501`은 Postgres 자신의 영어 권한 거부용으로 남겨둔다.

### 카운터가 없으면 쓰기 RPC도 없다

- **존재 확인 → 분기 → insert/delete → 카운터 증감**이 한 원자 단위여야 하는 쓰기만 RPC로 내린다.
  `SELECT → +1 → UPDATE`는 두 요청이 동시에 0을 읽어 결과가 2가 아니라 1이 되고(lost update),
  supabase-js에는 행 잠금 옵션이 없다 → `FOR UPDATE`를 DB 함수로 내린다.
- 분기가 없는 증감(항상 insert)은 `count = count + 1` 자체가 원자적이라 **트리거**로 충분하다.
  ⚠ 그 트리거 함수도 **`security definer`가 필수**다. 호출자 권한으로 돌면 "본인 행만" UPDATE 정책에
  걸려 남의 행의 카운터 UPDATE가 0행으로 조용히 실패한다.
- **카운터가 없으면 지킬 불변조건이 행 하나뿐이고, 그 행은 복합 PK가 이미 묶는다** → RPC 없이
  훅이 insert/delete를 직접 보낸다(`transfer_deal_watch`). 집계는 그때그때 `count(*)`로 센다 —
  어긋날 값 자체를 두지 않는다.
- **카운터가 있어도 트리거가 단독으로 관리하면 RPC가 필요 없다** — 분기(insert/update/delete)를 클라이언트가
  골라도 합계는 행이 실제로 바뀐 만큼만 트리거가 움직이므로 어긋날 수 없다(`transfer_deal_comment_vote`).
  RPC가 필요한 것은 **카운터를 함수가 직접 증감할 때**다(`SELECT → +1 → UPDATE`의 lost update).

⚠ **PostgREST의 upsert(`Prefer: resolution=merge-duplicates`)를 쓰지 않는다.**
`ON CONFLICT DO UPDATE SET`에 **payload의 모든 컬럼**을 실어서 키 컬럼에도 UPDATE 권한을
요구한다(실측 42501). 그 권한을 열면 자기 행의 부모 키를 다른 부모로 옮겨 **DELETE 정책을 두지
않은 "취소 불가"를 우회**할 수 있다 → 클라이언트가 "내 행이 있는가"로 갈라 insert 또는 값 컬럼만
바꾸는 UPDATE를 보낸다. 컬럼 grant는 바꿀 수 있는 컬럼 하나뿐이다.

## 운영진만 쓰는 데이터는 **쓰기 경로를 만들지 않는다**

사용자가 만드는 것이 아닌 데이터(`transfer_news`·`transfer_club`·`transfer_deal`·`transfer_name_ko`·`transfer_deal_push_log`·`transfer_window`·`transfer_prediction_score`·`transfer_deal_round_result`)는
**쓰기 정책도 grant도 두지 않는다.** 쓰는 것은 service_role로 도는 운영 스크립트 하나뿐이다
(사람이 미리 써 두는 데이터라면 마이그레이션이 그 유일 경로다 — 테이블 소유자로 실행되어
RLS를 지나지 않는다).

- 얻는 것: "앱에서 고칠 수 없다"가 정책 문구가 아니라 **구조**가 된다. 정책에는 시점 개념이 없어
  "진행 중인 것에 항목 끼워 넣기" 같은 구멍이 생기는데, 쓰기 경로가 없으면 그것이 성립할 수 없다.
- 대가: **관리 화면이 없다.** 운영자가 런타임에 값을 고쳐야 하는 시점이 오면, 그때가 관리 화면과
  권한 판정을 함께 들이는 시점이다(열거값을 lookup 테이블로 옮기는 판단과 같은 형태다) —
  그때도 쓰기는 테이블 grant가 아니라 권한을 확인하는 definer 함수를 지나게 한다.
- ⚠ writer가 service_role이면 **grant·정책은 아무것도 막지 못한다** — 지켜야 할 불변식은 CHECK와
  트리거가 진다(`transfer_news_freeze_collected`가 그 자리다).
- ⚠ **행 수 제약은 CHECK로 표현할 수 없다.** "항목 최소 N개"처럼 행 간 제약이 필요하면 `rls.sql`에
  "위반 행이 0행"인 질의를 두어 대신 지킨다 — 검증 대상이 사용자 입력이 아니라 우리가 쓴 데이터라
  성립하는 배치다. ⚠ 그 질의는 **시드가 걸리는 것을 먼저 보이고**(1 기대) 롤백한 뒤 실제 데이터를
  센다(0 기대) — 질의가 아무것도 세지 않게 되면 라벨만 남고 통과한다.

## 비정규화 카운터는 트리거가 단독으로 관리한다

실제 행 수를 베낀 컬럼은 **관리 주체를 하나로 못박는다.**

- 카운터를 RPC가 증감했더니, 유저 탈퇴로 `auth.users → profiles → (자식 행)`이 cascade 삭제되는
  경로가 RPC를 거치지 않아 **카운터가 실제보다 큰 채 영구히 남았다**(`check >= 0` 때문에 항상 과대,
  자가 교정 불가) → `after insert or delete` 트리거가 단독 관리하고, RPC는 잠금·검증·토글만 한다.
- 새 카운터를 만들면 **"어느 경로로 행이 생기고 사라지든 맞는가"** 를 먼저 따진다.
  cascade·직접 SQL·관리 도구까지 포함해서.
- ⚠ **카운터는 뷰어별로 달라질 수 없다.** 정책이 뷰어마다 행을 감추면 헤딩 숫자와 실제로 보이는
  행 수가 어긋난다 — 그 차이는 화면 문구로 갚는다("표시되지 않은 항목 N개").

## ⚠ 부모의 소프트 삭제는 자식 정책까지 함께 묶어야 한다

부모에 `deleted_at`을 넣고 SELECT 정책으로 감췄는데 자식 정책에 부모와의 연결이 없으면,
**삭제된 부모의 자식이 비로그인에게 그대로 공개**되고(id가 연번이면 삭제된 id는 목록의 구멍으로
추정된다), **삭제된 부모에 자식을 더 달 수도** 있다(실측).

자식 테이블의 select·insert 정책에 부모 생존을 건다:

```sql
create policy "child_select_visible" on public.child
  for select using ( public.parent_is_alive(child.parent_id) );
```

같은 리소스에 대해 **자식 종류마다 삭제 판정이 달라지면 안 된다** — RPC 쪽만 막고 정책 쪽을
잊는 게 전형적인 실수다. 판정은 아래 "서브쿼리를 인라인으로 쓰지 않는다"대로 헬퍼 함수 하나가 갖는다.

## ⚠ `on delete cascade`는 RLS를 적용받지 않는다

cascade 삭제는 RI(참조 무결성) **내부 트리거**가 수행하므로 정책이 개입하지 않는다.
그래서 "본인 것만 삭제" 정책이 있어도, 내 행을 지우면 거기에 매달린 **남의 행까지 함께 사라진다** —
정책의 간접 우회로다.

- `transfer_deal_suitor` — 딜의 관심 구단. 딜이 지워지면 함께 사라진다(파생 데이터라 잃을 것이 없다).
- `transfer_deal_push_log` — 딜의 발송 기록. 딜이 지워지면 함께 사라진다(알릴 딜이 없다).
- `transfer_club_follow.club_code` — 구단 행이 지워지면 그 구단의 응원 행이 함께 사라진다. 파생은 구단을 지우지
  않는다 — 구단을 정리하는 작업을 만들려면 "누구의 응원 구단까지 지우는가"를 먼저 따진다.
- `transfer_club_follow.user_id`·`profiles_push_subscription.user_id`(→ `profiles`) — 탈퇴하면 그 사람의 응원 구단과
  구독이 사라진다(남길 이유가 없는 본인 데이터다).
- `transfer_deal_prediction.user_id`(→ `profiles`) — 탈퇴하면 그 사람의 예측이 사라지고 집계가 줄어든다(트리거가 맞춘다).
  그 회차의 소수 의견 가중이 바뀌어 **남의 점수가 다음 채점에서 움직일 수 있다** — 채점이 매번 처음부터라 어긋나지 않고,
  탈퇴한 사람의 표를 집계에 남길 방법이 없어 수용한다. `transfer_prediction_score.user_id`도 cascade다.
- `transfer_deal_prediction_tally.deal_id`·`transfer_deal_round_result.deal_id` — cascade지만 예측 FK가 restrict라 표가 남은 딜은 애초에 지워지지 않는다.
- `transfer_deal_watch` — 재파생이 딜을 지우면 모든 사용자의 관심이 함께 사라진다.
  딜이 없어졌으니 관심도 뜻을 잃는다는 판단으로 **수용한 트레이드오프**다.
  ⚠ 같은 딜에 매달린 **댓글은 반대로 `restrict`다** — 사용자가 쓴 글은 뜻을 잃지 않는다(위 댓글 절).
- `transfer_deal_comment.parent_id` — 루트를 지우면 남이 단 답글까지 사라진다 → 삭제 확인 문구가 알린다.
- `transfer_deal_comment_vote.comment_id` — 댓글을 지우면 거기 던진 남의 표도 사라진다. 표는 그 댓글에 대한
  것이라 댓글과 함께 뜻을 잃는다 — **수용한 트레이드오프**다(합계를 담은 행 자체가 사라지므로 어긋날 숫자도 없다).
- `transfer_deal_comment.user_id`·`transfer_deal_comment_vote.user_id`(→ `profiles`) — 탈퇴하면 그 사람의 댓글
  (과 거기 달린 남의 답글)·표가 사라진다. 탈퇴한 사람의 글을 남기려면 작성자 표기를 대체할 방법이 먼저 있어야
  하므로 지금은 **수용한다**. 표가 사라질 때 남의 댓글 합계는 트리거가 맞춘다(cascade도 행 삭제라 트리거가 돈다).
- 사용자가 지우는 행에서 남의 행이 함께 사라진다면 **화면의 삭제 확인 문구가 그 사실을 고지해야 한다** —
  정책이 못 막는 것을 UI 계약으로 갚는 셈이다.

새 FK에 cascade를 걸 때는 **"이 삭제가 누구의 행까지 지우는가"** 를 정책과 따로 따진다.

## 트리거는 필요한 변경에만 발화시킨다

`touch_updated_at`을 조건 없이 걸었더니 카운터를 올리는 UPDATE에도 발화해 **남의 동작만으로
내 행에 "수정됨"이 붙었다**(실측). `created_at <> updated_at = 수정됨`이라는 계약을 스스로 깬 셈이다.
"수정됨"이 특정 컬럼에 걸려 있다면 WHEN 절로 좁힌다:

```sql
create trigger child_touch_updated_at
  before update on public.child for each row
  when (old.title is distinct from new.title or old.body is distinct from new.body)
  execute function public.touch_updated_at();
```

⚠ **`transfer_club`·`transfer_deal`은 이 WHEN 절이 없다 — 조건 없이 매 UPDATE에 건다.** 위
규칙이 WHEN으로 좁히는 이유는 "수정됨" 표시가 특정 컬럼에 걸려 있어서인데, 이 두 테이블은
쓰기가 파생 스크립트(service_role) 하나뿐이라 그 계약 자체가 없다 — `updated_at`은 "파생 값이
마지막으로 바뀐 시각"이면 충분하고(파생기는 값이 바뀐 행만 쓴다 — `transfer-pipeline.md`), 화면·사이트맵도 이 컬럼을 읽지 않는다(이적 딜의 lastModified는
`updated_at`이 아니라 `latest_reported_at`이다 — 사유는 `nextjs.md`의 sitemap 절).

## 소프트 삭제

⚠ **클라이언트가 `deleted_at`을 직접 UPDATE할 수 없다.** Postgres는 UPDATE의 **새 행**에도 SELECT 정책을 적용하므로, `deleted_at`을 채운 행이 SELECT 정책의 `deleted_at is null`을 통과하지 못해 거부된다(실측 확인). → 소프트 삭제는 definer RPC가 담당한다.

정책을 `deleted_at is null or <owner> = auth.uid()`로 푸는 선택지도 있지만, 그러면 `deleted_at` 필터가 모든 조회 쿼리로 흩어져 한 곳만 빠뜨려도 삭제된 행이 샌다. **정책은 엄격하게 두고 쓰기만 RPC로 내린다.** 덕분에 조회 훅에 `.is("deleted_at", null)`을 붙일 필요가 없다.

- **보이는가를 가르는 필터는 조회 훅이 아니라 정책에 둔다.** 정책이라 **`.limit()` 이전에 걸러지고**
  (클라이언트에서 걷어내면 페이지가 쪼그라든다), 서버(쿠키 클라이언트)와 클라이언트의 판정이 갈리지 않는다.
- ⚠ 같은 이유로, **새 행이 자기 SELECT 정책을 통과하지 못하게 되는 쓰기**(예: 뷰어 종속 필터가 자기 자신을
  걸러 내는 상태)는 CHECK로 원천 차단한다 — 그 상태에서는 자기 행 UPDATE가 통째로 0행이 된다(실측).

## PostgREST 임베딩

- **임베딩 경로가 둘 이상이면 FK 컬럼명으로 지정한다.** `transfer_deal → transfer_club`은 출발·도착 두 FK라 그냥 `transfer_club(...)`이라 쓰면 `PGRST201`로 실패한다 → `from:transfer_club!from_club_code(...)`.
  ⚠ 컬럼명만 쓴 `from:from_club_code(...)` 형태는 런타임엔 통해도 **생성 타입이 모호성을 풀지 못한다**(`!` 형태를 쓴다).
- `transfer_deal_watch(user_id)` 임베딩은 SELECT 정책이 "내 행만"이라 **결과 배열의 길이가 곧 `isWatched`** 다. 별도 필터를 잊어 남의 행이 새는 사고가 구조적으로 불가능하다. 비로그인은 정책이 `to authenticated`라 빈 배열 → `false`.
- select 컬럼 문자열은 `entities/*/api/mappers.ts`에 상수로 둔다(`DEAL_LIST_SELECT` 등) — 스키마가 바뀌면 한 곳만 고친다.
  ⚠ **select 문자열을 `+`로 잇지 않는다.** supabase-js가 **리터럴 타입**을 파싱해 결과 형태를 만드는데, 조각을 이어 붙이면 `string`으로 넓어져 추론이 통째로 `GenericStringError`가 된다(실측) — 한 템플릿 리터럴에 `as const`로 둔다.
- 0행이 정상인 조회는 `single()`이 아니라 **`maybeSingle()`** 을 쓴다(`single()`은 `PGRST116` 에러를 던져 "없음"과 진짜 에러가 섞인다).
- ⚠ PostgREST의 `max_rows`(1,000)에 걸리면 결과가 **조용히 잘린다.** 전체를 세야 하는 계산(비율·합계)을 클라이언트에서 하지 말고, 해야 한다면 잘렸는지(`Content-Range` 총계)를 함께 보고 그때는 숫자를 그리지 않는다.

## 마이그레이션

- 파일명은 **`YYYYMMDDHHMMSS_snake_name.sql`**.
- 원격에 적용된 마이그레이션은 **수정하지 않고 새 파일로 추가**한다(주석이라도 고치지 않는다). 아직 로컬에만 있는 것은 `supabase db reset`으로 재적용되므로 그 자리에서 고치는 게 맞다(깨진 마이그레이션과 수정 마이그레이션을 함께 남길 이유가 없다).
- `config.toml`의 `[auth]` 변경은 `db reset`이 아니라 **`supabase stop && supabase start`** 가 필요하다(gotrue 컨테이너 설정).
- 로컬 스택은 643xx 포트. API 64321 / DB 64322 / Studio 64323 / **Mailpit 64324**.
- ⚠ **CLI가 원격 프로젝트에 링크돼 있다**(`supabase/.temp/project-ref`) 그리고 `.env.local`에
  원격 DB 비밀번호·액세스 토큰이 있어 **확인 프롬프트 없이 통과할 수 있다.** 원격을 바꾸는 명령은 셋:
  `supabase db push`(플래그 없음) · `db reset --linked`(원격 초기화) ·
  **`config push`**(`config.toml`의 `[auth]`를 통째로 덮는다 — Site URL이 localhost가 되고
  테스트용으로 켜 둔 `[auth.email] enable_signup`까지 함께 올라간다. `docs/oauth-setup.md` §4).
  로컬 작업에는 반드시 `db reset`(로컬)만 쓴다. `pnpm db:types`는 `--local` 고정이라 안전하다.
- ⚠ **테이블을 지우는 마이그레이션은 되돌릴 수 없다** — 원격에 적용하기 전에 원격 DB를 백업한다.
  지우는 순서도 규약이다: 그 테이블·함수를 참조하는 정책(스토리지 정책 포함) → 테이블(`cascade`) →
  함수(시그니처까지 적는다 — 오버로드가 생겨도 엉뚱한 함수를 지우지 않게) → enum → 컬럼.

### RLS 정책에 서브쿼리를 인라인으로 쓰지 않는다

정책 안의 `exists (select 1 from other t where t.id = this.fk)`는 **상관관계를 잃는다.**
RLS 술어가 security-barrier 서브쿼리 안으로 들어가 바깥의 `fk = N` 등가류가 전파되지 않고
`fk IN (조건을 만족하는 전체)`로 비상관화된다 — 1건이 필요한데 전체를 훑는다.

실측(부모 5만·자식 300): 인라인 `exists` **4.76ms** vs `stable security definer` 헬퍼 **0.61ms**.
버퍼는 헬퍼가 더 쓰지만(912 vs 633) 해시 구축 CPU가 지배적이다. 결정적인 건 **비용의 성격**이다 —
헬퍼는 자식 행 수(조회 limit)에 묶여 상한이 있고, 인라인은 부모 테이블 크기에 비례해 무한정 늘어난다.

→ 부모 판정은 `stable security definer` 헬퍼 함수(`<parent>_is_alive(bigint)` 형태)로 빼고 자식 정책들이 공유한다.
  ⚠ 그 헬퍼를 비로그인 select 정책이 부르면 **anon에도 EXECUTE를 열어야** 한다(닫으면 조회가 통째로 42501이다) —
  위 anon 화이트리스트와 definer 표에 함께 적는다.
⚠ 반대로 정책에 definer 호출을 **하나 더 얹는 것은 공짜가 아니다** — 행별 판정 함수 하나로 정렬 조회가
  **8.7ms → 151.6ms(17배)** 로 뛴 실측이 있다. 권한별로 다른 행을 보여야 하면 SELECT 정책에 `or …`를
  얹지 말고 전용 definer 조회 함수로 가른다(`language sql`로 — plpgsql은 인라인되지 않아 PostgREST가 붙인
  `order/limit`이 전체를 물질화한 뒤 적용된다).

## 검증 자산

| 파일 | 용도 |
|---|---|
| `supabase/tests/rls.sql` | RLS·컬럼 권한·함수 전량 검사 (전체 rollback이라 DB에 흔적 없음). ⚠ 여기에 **섹션 번호를 적지 않는다** — 섹션을 더하고 빼는 순간 거짓이 된다. 다루는 것: 프로필 편집(본인만 수정·아바타 경로·`created_at` 위조·스토리지 정책과 버킷 설정값), 닉네임 정규형·허용 문자·랜덤 배정 포화, 길이 한도, 이적 소식·보드·관심·요약·이동 판정·이름 캐시, 딜 댓글·답글 깊이·표 합계, 응원 구단, 웹 푸시 구독·발송 기록, 딜 성사 예측(회차·시각 트리거·마감·거두기 없음·집계·점수·회차 결과), 그리고 아래 전수 가드 |
| — **전수 가드는 테이블명을 하드코딩하지 않는다** | public 스키마 기본 권한이 anon/authenticated에 ALL이라, 새 마이그레이션이 `revoke`를 한 번만 잊어도 즉시 구멍이 된다. 고정 목록만 검사하면 **새 테이블은 검사 대상에 들어오지도 않는다** → RLS 미적용·anon 쓰기 권한·search_path 미고정·anon EXECUTE를 전수로 훑는다 |
| — ⚠ **전수 가드는 `[0행 기대]` 라벨을 달아야 한다** | 라벨이 없으면 러너의 값 대조가 그 질의를 보지 않아, **행이 나와도 "✅ 통과"로 넘어간다.** 실제로 그랬다 — CHECK 평가 함수를 anon에 열었는데 가드가 그 이름을 뱉은 채 통과했다. 전수 가드가 러너에 안 잡히면 가드가 아니다 |
| — **INSERT 시점 위조**도 따로 본다 | UPDATE만 보면 `grant insert` 목록이 넓어지는 회귀(카운터·타임스탬프 동봉)를 못 잡는다 |
| — **SELECT 가능 컬럼 목록을 전수 대조한다** | `profiles`는 SELECT grant를 컬럼으로 좁혀 두었다 → 컬럼을 더할 때 grant를 잊으면 그 컬럼만 조용히 42501이 되는데, 권한 가드는 SELECT를 보지 않는다 |
| — ⚠ `:login_anon`은 role만 바꾸고 `request.jwt.claims`를 그대로 둔다 | 앞선 `:login_alice`의 `sub`가 남아 `auth.uid()`가 계속 그 사람을 가리킨다(실제로 틀린 값을 냈다). **판정이 `auth.uid()`에 걸린 검사는 claims까지 비워야** 진짜 비로그인이 된다 — 정책이 `to authenticated`인 검사들은 role만으로 갈려 이 함정에 걸리지 않는다 |
| — 운영 데이터 검사는 **테스트 전용 네임스페이스**를 쓴다 | 소스 id(`rss:rlstest-*`)·구단 코드(`rlstest-*`)·`deal_key`를 테스트 전용으로 둔다 — 스크립트가 먼저 넣어 둔 실제 행과 PK가 충돌하면 seed가 죽고 뒤따르는 `\gset`이 전부 비어 **연쇄로 실패**하고, 섞이면 개수 검사가 조용히 틀어진다 |
| — 시드 INSERT는 반드시 `begin;` **아래**에 | 위에 두면 오토커밋으로 새어나가 실행할 때마다 행이 쌓인다(실제로 그랬다) |
| — 시각 비교 검사는 시드를 과거로 밀 것 | `now()`는 **트랜잭션 시작 시각**이라 한 트랜잭션 안에서 insert의 default와 트리거의 값이 같아진다 → "수정하면 updated_at이 바뀐다"를 증명할 수 없다 |
| — 경합은 못 잡는다 | 두 세션이 필요한 회귀(`for update` 누락 등)는 이 파일이 한 트랜잭션이라 볼 수 없다 |
| 이적 파이프라인의 테스트·평가·벤치 | `docs/conventions/transfer-pipeline.md`의 검증 자산 절 |
| **`supabase/seed.sql`** | `db reset`이 **자동 실행**한다 — 개발 계정(alice/bob)과 프로필. ⚠ 시드가 없으면 마이그레이션을 고칠 때마다 reset이 개발 데이터를 통째로 날린다. 닉네임을 명시적으로 고정하는 이유는 랜덤 배정이면 유일성 검사가 부딪힐 상대를 잃어 **조용히 무의미해지기** 때문이다 |
| **`supabase/tests/run-rls.sh`** | rls.sql을 돌리고 **양방향으로** 대조한다 — ① 기대하지 않은 ERROR ② **차단 기대인데 통과한 것** ③ 값 기대 라벨(`[0행 기대]` 등)의 실제 값. ②를 안 보면 로그가 깨끗한 채로 검사가 죽어 있다(실제로 2건이 그랬다) |
