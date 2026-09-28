/**
 * 이적 소식 소스 레지스트리.
 *
 * 여기 실린 수치는 2026-08-29(여름 이적시장 마감 직전 = 연중 최성수기)에 공개 API·피드를
 * 직접 호출해 실측한 값이다. 소스는 죽으므로 시간이 지나면 틀려진다 — 소스를 더하거나
 * 빼기 전에 다시 잰다.
 *
 * ⚠ **X(트위터) API를 쓰지 않는다.** 2026년 기준 읽기 1,000건당 $5인 종량제라, 같은 정보를
 *   무료로 얻을 수 있는 경로(Bluesky 공개 API · 텔레그램 공개 미리보기 · 매체 RSS)를 쓴다.
 *
 * ⚠ **소스별 폴링 주기를 두지 않는다.** 크롤러는 소스마다 `pollSeconds`를 두고 매분 깨어나
 *   주기가 된 것만 돌렸는데, 그러려면 "마지막 실행 시각"을 저장할 테이블이 필요하다.
 *   정기 실행이 한 주기로 전 소스를 도는 형태면 그 상태가 없어진다 — 소스마다 요청이
 *   한두 번이라 한 번에 다 돌아도 상대 서버에 부담이 없다.
 *   대신 그 한 주기가 아래 `maxRunIntervalMinutes()`를 넘으면 안 된다.
 */

/**
 * 게시 시각이 이보다 오래된 항목은 받지 않는다.
 *
 * ⚠ 최초 수집(커서가 없을 때)이 과거를 통째로 끌고 온다 — Google News 검색 RSS는
 *   날짜와 무관하게 100건을 주고 실제로 **2017년 기사**가 들어왔다(크롤러 실측).
 *   이 피드는 "지금의 이적 소식"이라 그 행들은 쓸 데가 없다.
 */
export const MAX_ITEM_AGE_DAYS = 14;

export const SOURCES = [
  // ────────────────────────────────────────────────────────────────
  // Bluesky — 공개 API, 인증키 불필요, 전체 이력 페이지네이션 가능
  // ────────────────────────────────────────────────────────────────
  {
    id: "bsky:ornstein",
    label: "David Ornstein (The Athletic)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "david-ornstein.bsky.social" },
    // 소속사(The Athletic)가 직접 발급한 인증 — 사칭이 아님이 확인된다
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-08-29" },
    measured: {
      perDay30d: 2.0,
      note: "최근 120건 100%가 속보 표식. 2025-02~07 6개월 방치 전력이 있어 텔레그램 미러와 이중화한다. Bluesky는 그의 산출물 중 32%만 담는다.",
    },
  },
  {
    id: "bsky:benjacobs",
    label: "Ben Jacobs",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "jacobsben.bsky.social" },
    verification: { issuerHandle: "bsky.app", checkedAt: "2026-08-29" },
    measured: { perDay30d: 9.2, note: "22개월 중 0건인 달 없음 — 검증한 소스 중 유일하게 '끊긴 적 없음'이 입증됨." },
  },
  {
    id: "bsky:theathletic",
    label: "The Athletic FC",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "outlet",
    enabled: true,
    config: { handle: "theathleticfc.bsky.social" },
    verification: { issuerHandle: "bsky.app", checkedAt: "2026-08-29" },
    measured: { perDay30d: 1.7 },
  },
  {
    id: "bsky:kinsella",
    label: "Nizaar Kinsella (BBC Sport)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "nizaarkinsella.bsky.social" },
    verification: { issuerHandle: "bsky.app", checkedAt: "2026-08-29" },
    measured: { perDay30d: 1.87 },
  },
  {
    id: "bsky:delaney",
    label: "Miguel Delaney (Independent)",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "migueldelaney.bsky.social" },
    verification: { issuerHandle: "bsky.app", checkedAt: "2026-08-29" },
    measured: { perDay30d: 2.27 },
  },


  // ────────────────────────────────────────────────────────────────
  // Bluesky — 구단 담당 기자(2026-09-25 추가). 14일 수치는 본인 글만(답글·리포스트 제외) 센 값이다 —
  // 이적시장이 닫힌 비수기라 성수기보다 적다. 경기 이야기가 섞이지만 관련도 필터가 거른다.
  // ⚠ **본인 확인 없이 이름만 보고 등록하지 않는다** — 사칭 계정(정지된 plettenberg), 동명이인(falk·sheth),
  //   이름만 선점한 빈 계정이 실제로 있었다. 배지가 없으면 `verification.method`에 확인한 근거를 적는다:
  //   byline-links = 링크한 기사의 기자란이 본인 이름 · domain-handle = 본인 도메인 핸들 · profile-review = 소개·활동 대조.
  // ────────────────────────────────────────────────────────────────
  {
    id: "bsky:gold",
    label: "Alasdair Gold (football.london)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "alasdairgold.bsky.social" },
    verification: { issuerHandle: "bsky.app", checkedAt: "2026-09-25" },
    measured: { note: "토트넘. 14일 41건. 링크한 football.london 기사 4/4 기자란 본인." },
  },
  {
    id: "bsky:waugh",
    label: "Chris Waugh (The Athletic)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "chrisdhwaugh.bsky.social" },
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-09-25" },
    measured: { note: "뉴캐슬. 14일 62건." },
  },
  {
    id: "bsky:tanswell",
    label: "Jacob Tanswell (The Athletic)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "jacobtanswell.bsky.social" },
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-09-25" },
    measured: { note: "애스턴 빌라. 14일 78건." },
  },
  {
    id: "bsky:boyland",
    label: "Patrick Boyland (The Athletic)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "paddyboyland.bsky.social" },
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-09-25" },
    measured: { note: "에버턴. 14일 20건." },
  },
  {
    id: "bsky:pittbrooke",
    label: "Jack Pitt-Brooke (The Athletic)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "jackpittbrooke.bsky.social" },
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-09-25" },
    measured: { note: "토트넘. 14일 16건." },
  },
  {
    id: "bsky:doyle",
    label: "Ian Doyle (Liverpool Echo)",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "iandoylesport.bsky.social" },
    verification: { issuerHandle: null, method: "byline-links", checkedAt: "2026-09-25" },
    measured: { note: "리버풀. 14일 49건. 링크한 Echo 기사 4/4 기자란 본인(링크의 98%가 Echo)." },
  },
  {
    id: "bsky:lynch",
    label: "David Lynch",
    kind: "bluesky",
    tier: 1,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "davidlynchlfc.co.uk" },
    verification: { issuerHandle: null, method: "domain-handle", checkedAt: "2026-09-25" },
    measured: { note: "리버풀. 14일 17건. 핸들이 본인 도메인(davidlynchlfc.co.uk) — 도메인 소유자만 쓸 수 있다." },
  },
  {
    id: "bsky:ryder",
    label: "Lee Ryder (Chronicle Live)",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "leeryder.bsky.social" },
    verification: { issuerHandle: null, method: "byline-links", checkedAt: "2026-09-25" },
    measured: { note: "뉴캐슬. 14일 61건. 링크한 Chronicle 기사 4/4 기자란 본인(링크의 95%가 Chronicle)." },
  },
  {
    id: "bsky:townley",
    label: "John Townley (Birmingham Live)",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "johntownley.bsky.social" },
    verification: { issuerHandle: null, method: "byline-links", checkedAt: "2026-09-25" },
    measured: { note: "애스턴 빌라. 14일 99건. 링크한 Birmingham Live 기사 4/4 기자란 본인." },
  },
  {
    id: "bsky:benge",
    label: "James Benge (CBS Sports)",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "jamesbenge.bsky.social" },
    verification: { issuerHandle: null, method: "byline-links", checkedAt: "2026-09-25" },
    measured: { note: "전국(아스널 비중). 14일 20건. 소개 CBS + 링크한 CBS 기사 기자란 본인." },
  },
  {
    id: "bsky:mitten",
    label: "Andy Mitten (The Athletic)",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "andymitten.bsky.social" },
    verification: { issuerHandle: "theathletic.com", checkedAt: "2026-09-25" },
    measured: { note: "맨유. 14일 2건 — 게시가 드문 보조 소스." },
  },
  {
    id: "bsky:balague",
    label: "Guillem Balagué",
    kind: "bluesky",
    tier: 2,
    defaultAttribution: "verified_author",
    enabled: true,
    config: { handle: "guillem-balague.bsky.social" },
    verification: { issuerHandle: null, method: "profile-review", checkedAt: "2026-09-25" },
    measured: { note: "라리가. 14일 6건, 이적 속보는 드물다(방송·저술 홍보 위주). 소개·활동이 본인과 일치." },
  },

  // ────────────────────────────────────────────────────────────────
  // Telegram — t.me/s/<channel> 공개 미리보기 파싱. 인증 불필요.
  // ────────────────────────────────────────────────────────────────
  {
    id: "tg:romano",
    label: "Fabrizio Romano",
    kind: "telegram",
    tier: 1,
    // 메시지의 94%가 x.com/FabrizioRomano/status/... 퍼머링크를 포함한다 —
    // 채널이 스스로 출처를 증명하고, 트윗 id를 안정적인 중복 키로 쓸 수 있다.
    defaultAttribution: "linked_mirror",
    enabled: true,
    config: { channel: "fabrizioromanotg", official: true },
    measured: { note: "구독 384K. 메시지 중앙 간격 29분(≈70/일)." },
    // 1페이지(20건) 기준. 페이지를 넘기면 제약이 없지만 커서 이후만 받으므로 이 값이 상한을 정한다.
    retentionHours: 9.7,
  },
  {
    id: "tg:ornstein-mirror",
    label: "David Ornstein (비공식 미러)",
    kind: "telegram",
    tier: 2,
    // ⚠ 소개에 "*Unofficial"을 명시하고 광고를 판매하는 제3자 채널이다. 출처 링크를 가진
    //   메시지는 0%다. 단 🚨/EXCL/BREAKING 서명이 붙은 메시지는 그의 Bluesky 글과
    //   25/25(100%) 일치했으므로 그 패턴에 한해 원저자로 귀속한다 — 나머지는 저장하지 않는다.
    defaultAttribution: null,
    enabled: true,
    config: {
      channel: "David_Ornstein",
      official: false,
      mirrorsAuthor: "david-ornstein.bsky.social",
      attributionSignature: /🚨|\b(EXCL|EXCLUSIVE|BREAKING)\b/,
    },
    measured: { perDay30d: 7.5, note: "Bluesky 대비 3.7배 물량. 단 68%는 저자 확증 불가." },
    retentionHours: 46.2,
  },

  {
    id: "tg:dimarzio",
    label: "Gianluca Di Marzio",
    kind: "telegram",
    tier: 1,
    // ⚠ 본인 사이트(gianlucadimarzio.com) 편집국 기사를 **영어로 옮겨** 올리는 채널이다 — 글마다 `@Dimarzio` 서명,
    //   채널 이름이 그의 X 핸들과 같다. 2026-09-25 대조: 9/23 사이트 기사("Udinese, Alaba ha terminato le visite
    //   mediche")가 9/24 06:31 UTC에 첫 문장까지 같은 영어로 올라왔다(반나절 지연). 사이트 본문은 이탈리아어라
    //   추출기가 못 읽고, 이 채널이 그의 유일한 영어 경로다. 사실상 공식으로 보고 채널에 귀속한다.
    // ⚠ 트윗 퍼머링크가 없다(사이트 글을 옮기므로) — `--verify`의 "퍼머링크 절반 미만" 경고 대상에서 뺀다.
    defaultAttribution: "linked_mirror",
    enabled: true,
    config: { channel: "Dimarzio", official: true, permalinks: false },
    measured: { note: "구독 500. 20건이 9/6~9/24에 걸친다(하루 1건 안팎, 이적시장 마감 직후 비수기)." },
    retentionHours: 430,
  },

  // ────────────────────────────────────────────────────────────────
  // 매체 공식 RSS
  // ⚠ ESPN·Transfermarkt는 넣지 않는다 — GitHub 러너(데이터센터 IP)에서 빈 응답(200·0바이트)을 받아
  //   정기 수집이 불가능했고, 거기 실리는 소식은 이미 다른 소스가 다룬 뒤라 얻는 것도 적다.
  // ⚠ BBC·Sky는 ETag/Last-Modified를 주지 않는다 — 조건부 요청은
  //   항상 200이라 구현해도 트래픽이 줄지 않는다. 시도하지 말 것.
  // ────────────────────────────────────────────────────────────────
  {
    id: "rss:bbc-football",
    label: "BBC Sport",
    kind: "rss",
    tier: 1,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
    retentionHours: 24,
  },
  {
    id: "rss:bbc-gossip",
    label: "BBC 이적 가십",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    // 하루 1건의 요약 칼럼이라 매체 단위 귀속만 있다 — 개별 기자 추적의 대체재가 아니다.
    config: { url: "https://feeds.bbci.co.uk/sport/football/gossip/rss.xml" },
  },
  {
    id: "rss:sky-transfers",
    label: "Sky Sports",
    kind: "rss",
    tier: 1,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.skysports.com/rss/11095" },
    // ⚠ 가장 짧은 보관시간이다 — 실행 주기의 상한을 이 소스가 정한다.
    retentionHours: 8.7,
  },
  {
    id: "rss:guardian-football",
    label: "Guardian",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.theguardian.com/football/rss" },
    retentionHours: 89,
  },

  // ────────────────────────────────────────────────────────────────
  // 지역지·전문 매체 RSS(2026-09-25 추가) — **기사마다 기자 이름(byline)이 붙는다**(`bylineOf`).
  // 등재된 기자면 그 기자로 귀속·등급을 매기고(`reporters.json`의 `bylines`), 아니면 매체 단위다.
  // ⚠ Reach plc 지역지(MEN·Echo·football.london·Chronicle·Birmingham Live·Mirror)는 `?service=rss`가 맞는 URL이다 —
  //   `/all-about/{구단}/`가 아닌 football.london은 `/{구단}/?service=rss`다(옛 패턴은 2017년에 멈춘 빈 피드).
  // ⚠ 유럽 리그는 기자 본인 경로가 거의 없어(X·모국어) **영어 전문 매체**로 덮는다.
  // ────────────────────────────────────────────────────────────────
  {
    id: "rss:men-manutd",
    label: "Manchester Evening News — Man Utd",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.manchestereveningnews.co.uk/all-about/manchester-united-fc/?service=rss" },
    measured: { note: "25건. Luckhurst byline은 측정 시점 창에는 없었다." },
    retentionHours: 42,
  },
  {
    id: "rss:men-mancity",
    label: "Manchester Evening News — Man City",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.manchestereveningnews.co.uk/all-about/manchester-city-fc/?service=rss" },
    measured: { note: "25건. Bajkowski 8건." },
    retentionHours: 114,
  },
  {
    id: "rss:echo-liverpool",
    label: "Liverpool Echo — Liverpool",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.liverpoolecho.co.uk/all-about/liverpool-fc/?service=rss" },
    measured: { note: "25건. Doyle 6건. 보관이 짧은 편." },
    retentionHours: 27.4,
  },
  {
    id: "rss:echo-everton",
    label: "Liverpool Echo — Everton",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.liverpoolecho.co.uk/all-about/everton-fc/?service=rss" },
    measured: { note: "25건. Joe Thomas 3건." },
    retentionHours: 69.7,
  },
  {
    id: "rss:fl-arsenal",
    label: "football.london — Arsenal",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.football.london/arsenal-fc/?service=rss" },
    measured: { note: "25건." },
    retentionHours: 49.3,
  },
  {
    id: "rss:fl-chelsea",
    label: "football.london — Chelsea",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.football.london/chelsea-fc/?service=rss" },
    measured: { note: "25건." },
    retentionHours: 87.1,
  },
  {
    id: "rss:fl-tottenham",
    label: "football.london — Tottenham",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.football.london/tottenham-hotspur-fc/?service=rss" },
    measured: { note: "25건. Gold 8건." },
    retentionHours: 64.5,
  },
  {
    id: "rss:fl-westham",
    label: "football.london — West Ham",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.football.london/west-ham-united-fc/?service=rss" },
    measured: { note: "주 5건 수준으로 드물다." },
    retentionHours: 96.8,
  },
  {
    id: "rss:chronicle-nufc",
    label: "Chronicle Live — Newcastle",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.chroniclelive.co.uk/all-about/newcastle-united-fc/?service=rss" },
    measured: { note: "25건. Ryder 10건." },
    retentionHours: 56.6,
  },
  {
    id: "rss:birmingham-villa",
    label: "Birmingham Live — Aston Villa",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.birminghammail.co.uk/all-about/aston-villa-fc/?service=rss" },
    measured: { note: "25건. Townley 19건." },
    retentionHours: 119.2,
  },
  {
    id: "rss:mirror-football",
    label: "Mirror Football",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.mirror.co.uk/sport/football/?service=rss" },
    measured: { note: "25건. 회전이 빠르다(보관 14시간)." },
    retentionHours: 13.9,
  },
  {
    id: "rss:standard-football",
    label: "Evening Standard Football",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.standard.co.uk/sport/football/rss" },
    measured: { note: "23건." },
    retentionHours: 23.9,
  },
  {
    id: "rss:football-italia",
    label: "Football Italia",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.football-italia.net/feed/" },
    measured: { note: "세리에 A 영어 매체. 20건." },
    retentionHours: 17.2,
  },
  {
    id: "rss:gffn",
    label: "Get French Football News",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.getfootballnewsfrance.com/feed" },
    measured: { note: "리그 1 영어 매체. 10건." },
    retentionHours: 22.6,
  },
  {
    id: "rss:sempreinter",
    label: "SempreInter",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: false,
    config: { url: "https://sempreinter.com/feed" },
    measured: {
      note:
        "인테르 팬 매체(영어). 루머 재인용이 많다. ⚠ 꺼 둔다(2026-09-28): Cloudflare가 GitHub Actions 러너 IP에 403을 준다" +
        "(같은 User-Agent로 가정용 IP에서는 200). 저장된 행이 0건이었고, 피드 20건 중 딜 후보는 1건이었다 — 세리에 A는 " +
        "football-italia·dimarzio·romano·sempremilan이 덮는다. 차단이 풀렸는지는 러너에서 --only로 다시 잰다.",
    },
    retentionHours: 271,
  },
  {
    id: "rss:sempremilan",
    label: "SempreMilan",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://sempremilan.com/feed" },
    measured: { note: "밀란 팬 매체(영어). 100건 중 81건이 한 필자." },
    retentionHours: 113.4,
  },
  {
    id: "rss:telegraph-football",
    label: "Telegraph Football",
    kind: "rss",
    tier: 1,
    defaultAttribution: "outlet",
    enabled: false,
    config: { url: "https://www.telegraph.co.uk/football/rss.xml" },
    measured: { note: "⚠ 꺼 둔다(2026-09-25): 최신 항목이 9/20에 멈췄고 120건 중 101건이 byline 없음, Matt Law 기사 0건. 피드가 되살아나면 다시 잰다." },
    retentionHours: null,
  },

  // ────────────────────────────────────────────────────────────────
  // Google News RSS — 개인 채널이 없는 기자를 간접 커버.
  // ⚠ 커버리지가 기자마다 극단적으로 갈린다(7일 실측): Romano 48 · Ornstein 46 → 유효,
  //   Mokbel 3 · Di Marzio 4 · Paul Joyce 0 → 사실상 무용. 목벨은 그 공백을 드러내려고 켜 둔다.
  // ────────────────────────────────────────────────────────────────
  {
    id: "gnews:romano",
    label: "Google News — Fabrizio Romano",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: googleNews("Fabrizio Romano") },
    retentionHours: 110,
  },
  {
    id: "gnews:ornstein",
    label: "Google News — David Ornstein",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: googleNews("David Ornstein") },
    retentionHours: 110,
  },
  {
    id: "gnews:mokbel",
    label: "Google News — Sami Mokbel",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: googleNews("Sami Mokbel") },
    measured: { perDay30d: 0.4, note: "7일 3건. 무료로는 커버 불가에 가깝다는 사실을 드러내기 위한 소스." },
  },
];

/** Google News 검색 RSS — 따옴표로 감싼 정확 일치 검색 */
function googleNews(query) {
  const q = encodeURIComponent(`"${query}"`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

export function enabledSources() {
  return SOURCES.filter((s) => s.enabled);
}

export function findSource(id) {
  return SOURCES.find((s) => s.id === id);
}

/**
 * 정기 실행 주기의 상한(분) = 켜진 소스 중 가장 짧은 피드 보관시간 ÷ 3.
 *
 * 보관시간을 넘기면 항목이 피드에서 밀려나 유실된다. ÷3은 한두 번 실패해도 다음 실행이 받을
 * 여유를 두기 위해서다.
 * ⚠ **실제 스케줄을 검사하지는 않는다** — 이 스크립트는 자기가 몇 분마다 불리는지 모른다.
 *   스케줄(크론·워크플로)을 정하는 자리에서 이 값을 보고 맞춘다. 소스를 더하거나 보관시간을
 *   다시 쟀으면 이 값이 줄어들 수 있으니 스케줄도 함께 본다.
 */
export function maxRunIntervalMinutes() {
  const hours = enabledSources()
    .map((s) => s.retentionHours)
    .filter((h) => h != null);
  return hours.length ? Math.floor((Math.min(...hours) * 60) / 3) : null;
}
