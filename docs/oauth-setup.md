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

| | Redirect URI (콘솔에 등록) |
|---|---|
| 로컬 | `http://127.0.0.1:64321/auth/v1/callback` |
| 원격 | `https://<project-ref>.supabase.co/auth/v1/callback` |

앱으로 돌아오는 주소(`/sign-in?next=…`)는 `config.toml`의 `additional_redirect_urls`가 담당하고,
로컬은 이미 `http://localhost:3000/**`로 열려 있습니다.

⚠ 로컬 허용 목록에는 `http://127.0.0.1:3000/**`도 함께 들어 있습니다(127.0.0.1로 접속하는 경우).

⚠ **개발 서버가 3000번이 아니면 조용히 깨집니다.** 3000이 이미 점유돼 Next가 3001로 뜨면
그 주소는 허용 목록에 없어 GoTrue가 Site URL로 되돌려 보내고 **`?next=`가 통째로 사라집니다**
(로그인은 되는데 원래 가려던 화면으로 안 돌아가는 증상). 포트를 바꿔 쓸 거면
`additional_redirect_urls`에 그 포트도 추가하세요.

---

## 1. 카카오

1. [Kakao Developers](https://developers.kakao.com) → **내 애플리케이션** → 애플리케이션 추가
2. **앱 설정 → 플랫폼 → Web** → 사이트 도메인에 `http://localhost:3000` (배포 후 실제 도메인도)
3. **제품 설정 → 카카오 로그인** → 활성화 **ON**
4. 같은 화면의 **Redirect URI**에 위 0번 표의 주소 등록
5. **제품 설정 → 카카오 로그인 → 동의항목** — 아래 3개를 **사용 설정**

   | 항목 | 권장 |
   |---|---|
   | 닉네임 `profile_nickname` | 필수 동의 |
   | 프로필 사진 `profile_image` | 선택 동의 |
   | 카카오계정(이메일) `account_email` | 선택 동의 |

   ⚠ **이 단계를 건너뛰면 로그인이 `KOE205`로 실패합니다.** Supabase는 이 3개를 scope로
   요청하는데(실측: `scope=account_email+profile_image+profile_nickname`), 콘솔에서 사용
   설정하지 않은 항목을 요청하면 카카오가 거부합니다.

   ⚠ 이메일은 비즈니스 앱 심사가 필요할 수 있습니다. **선택 동의로 두면 됩니다** —
   사용자가 거부해도 `config.toml`의 `email_optional = true` 덕분에 로그인은 성공하고,
   닉네임은 이메일이 아니라 프로필 정보에서 뽑습니다(`handle_new_user`).

6. **앱 설정 → 앱 키 → REST API 키** → `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID`
7. **카카오 로그인 → 보안 → Client Secret** 코드 생성 후 **활성화 상태 ON**
   → `SUPABASE_AUTH_EXTERNAL_KAKAO_SECRET`

---

## 2. 구글

1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성
2. **API 및 서비스 → OAuth 동의 화면** → 사용자 유형 **외부** → 앱 이름·지원 이메일 입력
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
4. **승인된 리디렉션 URI**에 0번 표의 주소 등록
   (승인된 JavaScript 원본은 필요 없습니다 — 리디렉션 플로우입니다)
5. 클라이언트 ID → `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
   클라이언트 보안 비밀번호 → `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

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
                        (프로바이더 표시 이름 → 이메일 로컬파트 → 'user', 충돌 시 -2, -3 …)
```

| 증상 | 볼 곳 |
|---|---|
| `KOE205` | 카카오 동의항목 미설정 (1번 5단계) |
| `redirect_uri_mismatch` | 콘솔의 Redirect URI가 0번 표와 다름 |
| 로그인 후 목록으로만 감 | `additional_redirect_urls`(로컬) / Redirect URLs(원격)에 앱 주소 없음 |
| 즉시 "로그인을 마치지 못했어요" | PKCE verifier가 없다 — 다른 브라우저에서 링크를 열었거나 이미 한 번 교환을 시도했다(새로고침). 서버가 쿠키로 판정해 기다리지 않는다 |
| "로그인 중"에서 8초 뒤 에러 | verifier는 있는데 교환이 실패했다 — GoTrue 로그·프로바이더 설정 확인 |
| 닉네임이 전부 `user` | 프로바이더가 표시 이름을 안 줌 → `supabase/tests/rls.sql` 섹션 23으로 트리거 동작 확인 |
