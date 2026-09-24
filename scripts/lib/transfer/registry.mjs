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

  // ────────────────────────────────────────────────────────────────
  // 매체 공식 RSS
  // ⚠ BBC·Sky·Transfermarkt는 ETag/Last-Modified를 주지 않는다 — 조건부 요청은
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
    id: "rss:espn-soccer",
    label: "ESPN",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.espn.com/espn/rss/soccer/news" },
    retentionHours: 42.5,
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
  {
    id: "rss:transfermarkt",
    label: "Transfermarkt",
    kind: "rss",
    tier: 2,
    defaultAttribution: "outlet",
    enabled: true,
    config: { url: "https://www.transfermarkt.com/rss/news" },
    retentionHours: 14.9,
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
