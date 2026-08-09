# 소셜 로그인 설정 (카카오 · 구글)

이 앱의 **유일한 로그인 수단**입니다. 코드·설정은 이미 다 들어가 있고, 남은 것은
각 콘솔에서 앱을 만들어 **키 4개를 `.env.local`에 채우는 것**뿐입니다.

> 네이버는 넣을 수 없습니다 — Supabase가 지원하는 provider 목록에 없습니다
> (auth-js의 `Provider` 유니온에도, supabase CLI가 아는 external provider 20종에도 없음).
> 넣으려면 `service_role`로 세션을 직접 발급하는 서버 경로가 필요한데, 그건
> "Route Handler를 두지 않는다"(`docs/conventions/api-and-db.md`)를 깨는 결정입니다.

---

## 0. 먼저 알아둘 것 — 등록할 주소는 **앱 주소가 아니다**

각 콘솔에 등록하는 Redirect URI는 **Supabase의 콜백**입니다. 앱(`localhost:3000`)이 아닙니다.

| | `NEXT_PUBLIC_SUPABASE_URL` (환경 파일) | Redirect URI (콘솔에 등록) |
|---|---|---|
| 로컬 | `.env.local` → `http://127.0.0.1:64321` | `http://127.0.0.1:64321/auth/v1/callback` |
| 원격 | `.env.prod` → `https://<project-ref>.supabase.co` | `https://<project-ref>.supabase.co/auth/v1/callback` |

각 파일 주석에 그 환경의 주소가 완성형으로 적혀 있습니다.

⚠ **이 주소를 만드는 건 환경 파일이 아닙니다.** GoTrue가 자기 `API_EXTERNAL_URL`로 만들어
프로바이더에 보냅니다(로컬은 CLI가 `config.toml`의 포트로 정합니다 — 실측: `http://127.0.0.1:64321`).
`NEXT_PUBLIC_SUPABASE_URL`은 "앱이 어느 supabase로 가느냐"만 정하고, 두 값이 같은 인스턴스를
가리켜서 문자열이 일치할 뿐입니다. **환경 파일을 채우는 것과 콘솔에 등록하는 것은 별개의 일입니다.**

카카오·구글 콘솔 모두 여러 개를 등록할 수 있으니 **두 줄 다 넣어 두면** 환경을 오갈 때
콘솔을 고칠 필요가 없습니다.

앱으로 돌아오는 주소(`/sign-in?next=…`)는 `config.toml`의 `additional_redirect_urls`가 담당하고,
로컬은 이미 `http://localhost:3000/**`로 열려 있습니다.

⚠ 로컬 허용 목록에는 `http://127.0.0.1:3000/**`도 함께 들어 있습니다(127.0.0.1로 접속하는 경우).

⚠ **개발 서버가 3000번이 아니면 조용히 깨집니다.** 3000이 이미 점유돼 Next가 3001로 뜨면
그 주소는 허용 목록에 없어 GoTrue가 Site URL로 되돌려 보내고 **`?next=`가 통째로 사라집니다**
(로그인은 되는데 원래 가려던 화면으로 안 돌아가는 증상). 포트를 바꿔 쓸 거면
`additional_redirect_urls`에 그 포트도 추가하세요.

---

## 1. 카카오

> 메뉴 이름은 **현재 [카카오 로그인 설정하기](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)·
> [앱 설정](https://developers.kakao.com/docs/ko/app-setting/app) 문서 기준**입니다.
> 콘솔이 개편되면서 리다이렉트 URI·클라이언트 시크릿이 `[카카오 로그인]` 아래에서
> **`[앱] > [플랫폼 키]` 아래로 옮겨졌습니다.**

### ⚠ 먼저 읽으세요 — 개인(일반) 앱으로는 로그인이 실패합니다

**Supabase는 카카오 scope에 `account_email`을 항상 포함합니다**(실측:
`scope=account_email+profile_image+profile_nickname`). 그런데

- `account_email`은 **추가 기능**이라 **비즈 앱 전환 → 비즈니스 정보 심사 → 추가 기능 신청**을
  거쳐야 동의항목으로 켤 수 있습니다(`profile_nickname`·`profile_image`는 기본 제공).
- 설정하지 않은 동의항목을 요청하면 카카오가 **`KOE205`** 로 거부합니다.
- **이 scope는 뺄 수 없습니다.** 클라이언트가 `scopes`를 넘겨도 GoTrue는 기본값에 **덧붙일 뿐**
  대체하지 않고(실측: `…+profile_nickname+profile_image`로 중복 추가됨),
  `config.toml`의 `[auth.external.kakao]`에도 scope 옵션이 없습니다(CLI 구조체에 없음).

→ **카카오를 쓰려면 비즈 앱 전환이 사실상 필수입니다.** 개인 개발자도 신청할 수 있습니다.
   심사에 시간이 걸리므로 **구글부터 붙여 두고 카카오는 승인 후 켜는 것**을 권합니다
   (`src/features/sign-in`의 `OAUTH_PROVIDERS`에서 `"kakao"`를 잠시 빼면 버튼이 사라집니다).

### 무엇을 등록하는가 — 키와 리다이렉트 URI

셋 다 **같은 자리(`[앱] > [플랫폼 키] > [REST API 키]`)** 에 모여 있습니다.

| 필요한 값 | 콘솔 위치 | `.env.local` |
|---|---|---|
| **client_id** | `[앱] > [플랫폼 키] > [REST API 키]` 의 키 값 | `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID` |
| **client secret** | 그 아래 **`[클라이언트 시크릿]`** | `SUPABASE_AUTH_EXTERNAL_KAKAO_SECRET` |
| **리다이렉트 URI** | 그 아래 **`[리다이렉트 URI]`** | (등록만, env에는 안 넣음) |

- REST API 키가 곧 OAuth의 `client_id`입니다. JavaScript 키·네이티브 앱 키가 아닙니다 —
  **서버 간 토큰 교환은 GoTrue가 하므로 REST API 키 쪽에 등록해야 합니다.**
- 클라이언트 시크릿은 *"REST API 키(앱과 함께 자동 생성된 키 포함)는 [클라이언트 시크릿] 기능이
  활성화된 상태로 추가됩니다"* — 즉 **이미 켜져 있고** 값만 복사하면 됩니다. 예전처럼
  `[카카오 로그인] > [보안]`에서 따로 생성하지 않습니다.
  ⚠ *"삭제하거나 재발급하면 이전 코드는 복구할 수 없습니다"* — 재발급하면 `.env.local`도 함께 바꾸고
  `supabase stop && supabase start` 를 다시 하세요.

### 리다이렉트 URI에 정확히 무엇을 넣는가

**앱 주소가 아니라 Supabase의 콜백**입니다. 여기서 대부분 틀립니다.

| | 등록할 값 |
|---|---|
| 로컬 | `http://127.0.0.1:64321/auth/v1/callback` |
| 원격 | `https://<project-ref>.supabase.co/auth/v1/callback` |

문서가 명시하는 규칙:

- *"등록된 리다이렉트 URI와 요청 시 전달한 리다이렉트 URI가 정확히 일치하는지 확인"* —
  **완전 일치**입니다. 끝의 슬래시 하나까지 다르면 안 됩니다.
- *"HTTP와 HTTPS 프로토콜만 지원"*, *"경로(Path)에 임의의 파라미터 포함 불가"*
- **최대 10개** 등록 가능 → 로컬·원격을 **둘 다 등록해 두면 됩니다**(전환할 때마다 고칠 필요 없음)

⚠ 로컬 값은 `localhost`가 아니라 **`127.0.0.1`** 이고 포트가 `64321`입니다. GoTrue가 그 형태로
보내는 것을 실측했습니다(`redirect_uri=http%3A%2F%2F127.0.0.1%3A64321%2F…`). 완전 일치 규칙이라
`localhost`로 등록하면 통과하지 못합니다.

⚠ **콘솔이 IP나 비표준 포트를 거부하면** 로컬 OAuth 테스트를 포기하고 **원격 프로젝트로 테스트하세요**
(원격 콜백만 등록 → 앱의 `NEXT_PUBLIC_SUPABASE_URL`을 원격으로 교체). 문서는 리다이렉트 URI의
포트 제약을 언급하지 않지만, *로그아웃* 리다이렉트 URI에는 *"80, 443 포트를 지원"* 이라는 제약이
있어 같은 제약이 적용될 가능성을 배제할 수 없습니다.

### 동의항목

`[카카오 로그인] > [동의항목]` 에서 설정합니다. 각 항목의 `[설정]`을 누르면
**동의 단계**, **카카오계정으로 수집 후 제공** 여부, **동의 목적**(필수 입력)을 지정합니다.

| 항목 | 권장 | 비고 |
|---|---|---|
| 닉네임 `profile_nickname` | 선택 동의 | **값을 쓰지 않는다**(닉네임은 랜덤 배정). Supabase가 scope에 넣어 끄면 KOE205 |
| 프로필 사진 `profile_image` | 선택 동의 | **값을 쓰지 않는다**(사진은 직접 업로드). 위와 같은 이유로 켜 둔다 |
| 카카오계정(이메일) `account_email` | **필수 동의** | 유일하게 **실제로 쓰는 값**. 비즈 앱 전환 필요(위 경고) |

⚠ 이메일은 **선택 동의로 충분합니다.** 사용자가 거부해도 `email_optional = true` 덕분에 로그인은
성공하고, 닉네임은 이메일이 아니라 프로필 정보에서 뽑습니다(`handle_new_user`).
**앱은 이메일을 어디에도 쓰지 않습니다.**

### 하지 않아도 되는 것

| 항목 | 필요? | 이유 |
|---|---|---|
| **카카오싱크 / 간편가입** | ❌ | *"카카오 로그인을 확장해 서비스 가입 절차를 간소화하는 비즈니스 솔루션"* 으로, **비즈니스 채널 생성 + 앱-채널 연결 심사 + 약관 등록**이 추가로 필요합니다. 이 앱은 약관 동의 화면이 없고 **로그인이 곧 가입**이라 얻을 게 없습니다 |
| **카카오톡 채널** | ❌ | 카카오싱크 전용 |
| **로그아웃 리다이렉트 URI** | ❌ | 로그아웃은 `signOut({ scope: "local" })` 로 로컬 세션만 정리합니다 — 카카오계정 로그아웃을 함께 하지 않습니다 |
| **플랫폼 > 웹 사이트 도메인** | 선택 | 문서상 *"웹 링크 연결을 허용할 도메인"* 용도이고 REST API 방식에 필수라는 언급은 없습니다. 등록해도 손해는 없습니다 |
| **JavaScript 키 / 네이티브 앱 키** | ❌ | SDK를 쓰지 않습니다. 리다이렉트 URI도 **REST API 키 쪽**에 등록합니다 |

---

## 2. 구글

> 메뉴 이름이 바뀌었습니다. 예전 **API 및 서비스 → OAuth 동의 화면**은 이제
> **Google Auth Platform**이라는 별도 섹션이고, 좌측 메뉴가
> `개요 / 브랜딩 / 대상 / 클라이언트 / 데이터 액세스 / 확인`으로 쪼개져 있습니다.
> 검색창에 "Google Auth Platform"을 치면 바로 갑니다.

1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성
2. **Google Auth Platform → 브랜딩** — 앱 이름·사용자 지원 이메일·개발자 연락처 입력
   (처음 들어가면 "시작하기"가 이 값들을 물어보고 한 번에 만들어 줍니다)
3. **대상(Audience)** — 사용자 유형 **외부**
   - 이 상태의 앱은 **테스트 중**이라 `테스트 사용자`에 등록한 계정만 로그인됩니다.
     본인 계정을 여기 넣어 두면 개발 중에는 충분합니다.
   - ⚠ 공개 전에 **앱 게시(프로덕션으로 전환)** 를 해야 아무나 로그인할 수 있습니다.
     `openid`·`email`·`profile`만 쓰므로 **민감하지 않은 범위**라 구글 심사는 필요 없습니다.
4. **데이터 액세스** — 범위는 `openid` · `.../auth/userinfo.email` · `.../auth/userinfo.profile`
   세 개면 됩니다. 더 추가하면 심사 대상이 되니 넣지 마세요.
5. **클라이언트 → 클라이언트 만들기 → 애플리케이션 유형: 웹 애플리케이션**
6. **승인된 리디렉션 URI**에 0번 표의 주소 등록 — 로컬·원격 **둘 다** 넣어 두면 편합니다
   (승인된 JavaScript 원본은 필요 없습니다 — 리디렉션 플로우입니다)
7. 만들면 뜨는 값 두 개:
   - 클라이언트 ID (`…apps.googleusercontent.com`) → `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
   - 클라이언트 보안 비밀번호 (`GOCSPX-…`) → `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
   - 나중에 다시 볼 때는 **클라이언트 → (해당 클라이언트 클릭)** 우측에 있습니다.

카카오와 달리 **동의항목을 따로 켤 것이 없습니다.** 닉네임·프로필 사진·이메일은
`profile`·`email` 범위에 이미 들어 있습니다.

---

## 3. 키 넣고 반영하기

`.env.local`의 `replace-me` 4개를 실제 값으로 바꾼 뒤:

```bash
supabase stop && supabase start   # ⚠ db reset이 아니다 — gotrue 컨테이너 환경변수라 재기동이 필요하다
```

`supabase stop`은 데이터를 도커 볼륨에 백업하고 `start`가 복원하므로 **글·계정은 사라지지 않습니다.**

### 제대로 붙었는지 확인

```bash
# 1) GoTrue가 provider를 인식했는가 → kakao: true  google: true
curl -s http://127.0.0.1:64321/auth/v1/settings -H "apikey: <anon key>" | jq .external

# 2) authorize가 프로바이더로 넘어가는가 (client_id가 실제 값인지 눈으로 확인)
curl -s -o /dev/null -D - \
  "http://127.0.0.1:64321/auth/v1/authorize?provider=kakao&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fsign-in" \
  -H "apikey: <anon key>" | grep -i '^location:'
```

2번 응답의 `Location`이 `https://kauth.kakao.com/oauth/authorize?client_id=…`면 배선은 끝난 것입니다.
`client_id=replace-me`가 보이면 `.env.local`이 반영되지 않은 것이니 재기동을 확인하세요.

---

## 4. 배포(원격 프로젝트)

로컬 `config.toml`은 로컬 스택 전용입니다. **대시보드에서 설정하세요** —
Authentication → Providers → Kakao/Google 활성화 + 키 입력.

> `.env.prod`의 `SUPABASE_AUTH_EXTERNAL_*` 자리가 주석 처리돼 있는 이유가 이것입니다 —
> 원격 provider 키는 **파일이 아니라 대시보드**가 소유합니다. 그 파일이 담는 것은
> 앱이 어느 supabase를 바라보는지(`NEXT_PUBLIC_*`)뿐입니다.

원격을 바라보는 빌드를 로컬에서 확인하려면:

```bash
pnpm build:prod && pnpm start:prod
```

⚠ 실제 배포(Vercel 등)에서는 이 파일을 올리지 말고 **빌드 환경변수**에 같은 값을 넣으세요.
`NEXT_PUBLIC_*`는 빌드 시점에 인라인되므로 런타임 주입은 잡히지 않습니다.

> ### ⚠ `supabase config push` 는 쓰지 마세요
>
> `config.toml`의 `[auth]`를 **통째로** 링크된 원격에 밀어넣습니다. 이 파일은 로컬 값으로
> 채워져 있어서, 밀면 원격이 이렇게 덮입니다:
>
> | 항목 | 로컬 값 | 원격에 미치는 영향 |
> |---|---|---|
> | `site_url` | `http://localhost:3000` | **로그인 후 localhost로 되돌려 보낸다** |
> | `additional_redirect_urls` | localhost 쌍 | 배포 도메인 복귀가 전부 막힌다 |
> | `[auth.email] enable_signup` | `true`(테스트 자산용) | **화면 없는 이메일 가입 경로가 프로덕션에 열린다** |
> | `[auth.rate_limit] email_sent` | `100`(로컬 상향) | 메일 발송 제한이 이유 없이 완화된다 |
>
> `db push`·`db reset --linked`와 같은 등급의 "확인 프롬프트 없이 원격을 바꾸는" 명령입니다
> (CLI가 이 프로젝트에 링크돼 있습니다 — `supabase/.temp/project-ref`).

그리고 **Authentication → URL Configuration**에서

- **Site URL**: 배포 도메인
- **Redirect URLs**: `https://<배포 도메인>/**`

⚠ 앱으로 돌아오는 주소가 허용 목록에 없으면 GoTrue가 **조용히 Site URL로 되돌려** 보냅니다
(`?next=`가 통째로 사라져 "글쓰기를 누르고 로그인했는데 목록으로 떨어지는" 증상이 됩니다).

---

## 5. 흐름 (문제가 생겼을 때 어디를 볼지)

```
[로그인 버튼]  useOAuthSignIn (features/sign-in)
      │        redirectTo = {origin}/sign-in?next=…
      ▼
[GoTrue /authorize] ──302──▶ [카카오·구글 동의 화면]
      │                              │
      │◀──── code ───────────────────┘   (콘솔의 Redirect URI로 돌아온다)
      ▼
[앱 /sign-in?code=…]  createBrowserClient의 detectSessionInUrl이 교환
      │                SignInView는 그동안 "로그인 중"을 그린다(8초 상한).
      │                ⚠ 복귀 상태(code 유무·verifier 유무·error)는 **서버가 판정해** prop으로
      │                  내린다 — 클라이언트가 첫 렌더에서 URL을 읽으면 하이드레이션이 깨진다
      ▼
 SIGNED_IN ──▶ GuestOnly가 ?next= 또는 /posts로 이동   ← 목적지는 여기 한 곳이 정한다
      │
      ▼
 auth.users INSERT ──▶ handle_new_user 트리거가 profiles.nickname 생성
                        (축구 테마 **랜덤** 배정 — 프로바이더 표시 이름은 읽지 않는다.
                         사용자가 /profile 에서 바꾼다)
```

| 증상 | 볼 곳 |
|---|---|
| `KOE205` | 동의항목 미설정. **대부분 `account_email`이 원인**이고, 그건 비즈 앱 전환이 필요하다(1번 절) |
| `redirect_uri_mismatch` | 콘솔의 Redirect URI가 0번 표와 다름 |
| 로그인 후 목록으로만 감 | `additional_redirect_urls`(로컬) / Redirect URLs(원격)에 앱 주소 없음 |
| 즉시 "로그인을 마치지 못했어요" | PKCE verifier가 없다 — 다른 브라우저에서 링크를 열었거나 이미 한 번 교환을 시도했다(새로고침). 서버가 쿠키로 판정해 기다리지 않는다 |
| "로그인 중"에서 8초 뒤 에러 | verifier는 있는데 교환이 실패했다 — GoTrue 로그·프로바이더 설정 확인 |
| 카카오·구글이 별도 계정이 됨 | 이메일이 다르거나 없어 자동 연결이 안 된 것. `/profile`의 **로그인 수단**에서 직접 연결한다 (⚠ 이미 갈린 뒤에는 연결도 실패한다) |
