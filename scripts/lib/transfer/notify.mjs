/**
 * 알림 발송 — 딜 파생이 **이번 실행에 바꾼 것**(새 딜 · 상태가 바뀐 딜)을 웹 푸시로 보낸다.
 *
 * 받는 사람은 둘이다.
 *   - 그 딜을 관심 목록에 담은 사람(`transfer_deal_watch`) — 상태가 바뀔 때마다.
 *   - 그 딜에 걸린 구단을 응원 구단으로 고른 사람(`transfer_club_follow`) — 새 딜이 생길 때와 크게 진전될 때
 *     (합의 임박 · 합의 완료 · 오피셜). 루머 부인·결렬까지 보내면 구단 팬에게는 소음이 된다.
 *
 * 두 층으로 나뉜다(딜 파생과 같은 모양이다).
 *   - `planNotices` · `noticesByUser` · `payloadsFor` · `isPushEndpoint` — **순수 함수**. 회귀 테스트(`test-transfer-notify.mjs`)가
 *     DB 없이 이것만 돌린다.
 *   - `runNotifications(supabase, changes, opts)` — 기록 → 받는 사람 조회 → 발송 → 죽은 구독 정리.
 *
 * ⚠ **알리는 것은 "이번 실행의 변화"뿐이다.** 저장된 값과 새로 파생한 값의 차이(`writeDeals`의 `changes`)에서만 만든다 —
 *   기록(`transfer_deal_push_log`)만 보고 만들면 처음 켠 날 보드의 모든 딜이 "아직 안 알린 딜"이 된다.
 * ⚠ **기록을 먼저 넣고 보낸다.** 같은 (딜, 상태)는 한 번만 알린다 — 보내다 죽어도 다음 실행이 다시 보내지 않는다
 *   (알림은 한 번 덜 가는 편이 두 번 가는 것보다 낫다). 루머 ↔ 협상을 오가는 딜도 상태마다 한 번이다.
 * ⚠ **상태는 단계가 아니라 화면의 톤이다**(`STATUS_OF_STAGE`). 메디컬 → 개인 합의처럼 같은 톤 안의 이동은 화면에서
 *   달라지는 것이 없어 알리지 않는다. 이 표는 `src/entities/transfer/lib/stage.ts`의 `STAGE_STATUS`·`STATUS_LABEL`과
 *   **글자 하나까지 같아야 한다** — 스크립트는 TS를 import할 수 없어 사본을 두고, 테스트가 두 파일을 대조한다.
 * ⚠ **사람이 돌리는 재처리(`--reprocess`·`--rejudge`·`--replay`·`--derive-only`)에서는 부르지 않는다** — 규칙을 고친 뒤의
 *   일괄 변화는 소식이 아니다. 정기 실행만 부른다(`sync-transfer-news.mjs`).
 */
import { parse as legacyParse } from "node:url";
import webpush from "web-push";

/** 단계 → 상태 톤. ⚠ `stage.ts`의 `STAGE_STATUS`와 같아야 한다(테스트가 대조한다) */
export const STATUS_OF_STAGE = {
  official: "official",
  here_we_go: "hwg",
  medical: "imminent",
  personal_terms: "imminent",
  agreement: "imminent",
  offer: "talks",
  talks: "talks",
  rumour: "rumor",
  collapsed: "dead",
  denied: "denied",
  unknown: null,
};

/** 상태 톤 라벨. ⚠ `stage.ts`의 `STATUS_LABEL`과 같아야 한다(테스트가 대조한다) */
export const STATUS_LABEL = {
  official: "오피셜",
  hwg: "합의 완료",
  imminent: "합의 임박",
  talks: "협상 중",
  rumor: "루머",
  dead: "결렬",
  denied: "부인",
};

/** 응원 구단 팬에게도 알리는 **상태 변화** — 새 딜은 상태와 무관하게 알린다 */
const FOLLOWER_STATUSES = new Set(["imminent", "hwg", "official"]);

/** 이보다 오래된 보도로 생긴 변화는 알리지 않는다 — 수집이 며칠 멎었다 돌아온 뒤의 밀린 소식은 "지금"이 아니다 */
export const NOTICE_MAX_AGE_MS = 48 * 3_600_000;
/**
 * 한 실행에 보내는 알림 수의 상한. 넘치면 **확정된 소식(오피셜·합의 완료)부터** 이 수만큼만 보내고 나머지는 기록만 한다.
 * 규칙·사전 변경으로 딜이 한꺼번에 움직였을 때의 폭주를 막는 장치인데, 이적 마감일처럼 진짜 소식이 몰리는 시간에도
 * 닿는다 — 통째로 버리면 가장 알림이 필요한 날 아무것도 가지 않는다.
 */
export const MAX_NOTICES_PER_RUN = 25;
/** 상한을 넘겼을 때 먼저 보내는 순서 — 앞일수록 놓치면 안 되는 소식이다 */
const STATUS_PRIORITY = ["official", "hwg", "imminent", "dead", "talks", "denied", "rumor"];
/** 한 사람이 한 실행에 받는 알림 수 — 넘으면 한 건으로 묶는다 */
export const MAX_PER_USER = 3;
/** 한 사람에게 보내는 구독(기기) 수 상한 — 최근에 등록한 순. 구독 행은 사용자가 쓰는 값이라 한 계정이 발송 시간을 독점하지 못하게 한다 */
const MAX_SUBSCRIPTIONS_PER_USER = 10;
/** 푸시 서비스가 기기에 전달을 시도하는 시간(초) — 반나절 지난 이적 속보는 보내지 않는 편이 낫다 */
const TTL_SECONDS = 12 * 3600;
/** 소켓이 조용한 시간의 상한(web-push의 `timeout`) */
const SEND_TIMEOUT_MS = 10_000;
/** 한 건의 발송 전체에 주는 시간 — 응답을 조금씩 흘려 소켓을 살려 두는 서버가 워커를 붙잡지 못하게 한다 */
const SEND_DEADLINE_MS = 15_000;
const SEND_CONCURRENCY = 8;
const CHUNK = 100;
/** 죽은 구독을 지울 때의 묶음 — 주소가 길어 조회용 묶음(`CHUNK`)보다 작게 잡는다 */
const DELETE_CHUNK = 20;
/** 한 번에 읽는 행 수 — PostgREST `max_rows`(1,000)보다 작아야 "덜 찬 페이지 = 끝" 판정이 성립한다 */
const PAGE = 500;
/** 행선지 자리에 이름을 적는 구단 수 — ⚠ 화면(`route-label.ts`의 `ROUTE_CLUB_LIMIT`)과 같아야 한다(테스트가 대조한다) */
export const ROUTE_CLUB_LIMIT = 3;

/**
 * 아는 푸시 서비스의 주소인가 — 구독의 `endpoint`는 **사용자가 쓴 값**이고 이 스크립트가 거기로 요청을 보낸다.
 * 크롬 계열(FCM) · 파이어폭스 · 사파리(Apple) · 엣지(WNS)만 받는다. 모르는 호스트는 건너뛰고 경고로 남긴다 —
 * 브라우저가 새 푸시 서비스를 쓰기 시작하면 그 경고를 보고 여기 더한다.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

/**
 * 주소의 모양 — `https://호스트[:포트]/경로`. 호스트에는 영숫자·점·하이픈만 온다.
 * ⚠ **이 정규식이 방어의 본체다.** 판정(`new URL`)과 발송(web-push는 Node의 옛 `url.parse`로 접속한다)이 **다른 파서**라,
 *   `https://evil.example;.push.apple.com/x`처럼 두 파서가 호스트를 다르게 읽는 주소가 호스트 목록을 통과했다
 *   (WHATWG는 호스트를 `evil.example;.push.apple.com`으로, 옛 파서는 `;`에서 끊어 `evil.example`로 읽는다).
 *   호스트 자리의 글자를 좁히면 두 파서가 갈릴 여지가 없다.
 */
const ENDPOINT_SHAPE = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/\S*$/i;

/**
 * 아는 푸시 서비스로 가는 주소면 **정규화한 주소**를, 아니면 `null`을 돌려준다 — 발송은 이 반환값으로만 한다
 * (판정한 문자열과 보내는 문자열이 같아야 한다).
 */
export function pushEndpointUrl(endpoint) {
  if (typeof endpoint !== "string" || !ENDPOINT_SHAPE.test(endpoint)) return null;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  if (url.port !== "" && url.port !== "443") return null;
  if (!PUSH_HOSTS.some((re) => re.test(url.hostname))) return null;
  // 이중 방어 — 발송 라이브러리가 쓰는 파서도 같은 호스트를 읽는지 직접 대조한다
  if (legacyParse(url.href).hostname !== url.hostname) return null;
  return url.href;
}

export function isPushEndpoint(endpoint) {
  return pushEndpointUrl(endpoint) !== null;
}

/**
 * 행선지 자리의 글자 — 화면(`route-label.ts`의 `routeLabels`)과 같은 말을 쓴다: 앞 `ROUTE_CLUB_LIMIT`개를 `·`로 잇고
 * 나머지는 `외 N`, 없으면 `미정`. ⚠ 빈 칸의 낱말(`미정`·`미확인`·`FA`)도 그 파일의 사본이다 — 테스트가 대조한다.
 */
function destinationLabel(shorts) {
  if (shorts.length === 0) return "미정";
  const named = shorts.slice(0, ROUTE_CLUB_LIMIT).join(" · ");
  return shorts.length > ROUTE_CLUB_LIMIT ? `${named} 외 ${shorts.length - ROUTE_CLUB_LIMIT}` : named;
}

/**
 * 변화 → 알림 계획. 같은 톤 안의 이동 · 오래된 보도 · 톤이 없는 단계는 뺀다.
 *
 * @param {object[]} changes `writeDeals`가 돌려준 변화 — `{ dealId, prevStage, stage, player, playerKo, fromShort, toShorts,
 *   isFreeAgent, clubCodes, latestReportedAt, summary }`. `prevStage`가 null이면 새 딜이다.
 * @returns {{ dealId: number, status: string, isNew: boolean, toWatchers: boolean, toFollowers: boolean, clubCodes: string[],
 *   title: string, body: string, url: string, tag: string }[]}
 */
export function planNotices(changes, { nowMs }) {
  const notices = [];
  for (const c of changes) {
    const status = STATUS_OF_STAGE[c.stage] ?? null;
    if (status === null) continue;
    const isNew = c.prevStage == null;
    if (!isNew && STATUS_OF_STAGE[c.prevStage] === status) continue;
    const reportedMs = Date.parse(c.latestReportedAt);
    if (!Number.isFinite(reportedMs) || reportedMs < nowMs - NOTICE_MAX_AGE_MS) continue;

    const name = c.playerKo ?? c.player;
    const from = c.fromShort ?? (c.isFreeAgent ? "FA" : "미확인");
    const route = `${from} → ${destinationLabel(c.toShorts)}`;
    // 새 루머는 "루머"보다 "새 이적설"이 사건을 말한다 — 그 밖에는 화면의 뱃지와 같은 글자다
    const label = isNew && status === "rumor" ? "새 이적설" : STATUS_LABEL[status];
    notices.push({
      dealId: c.dealId,
      status,
      isNew,
      // 새 딜에는 아직 담은 사람이 없다
      toWatchers: !isNew,
      toFollowers: isNew || FOLLOWER_STATUSES.has(status),
      clubCodes: c.clubCodes,
      title: `${label} · ${name}`,
      // 둘째 줄은 최신 보도의 한국어 요약(있을 때) — 화면의 타임라인 첫 줄과 같은 문장이다
      body: c.summary ? `${route}\n${c.summary}` : route,
      url: `/transfers/${c.dealId}`,
      tag: `deal-${c.dealId}`,
    });
  }
  return notices;
}

/**
 * 사람별로 받을 알림을 모은다 — 관심으로도 응원 구단으로도 걸린 딜은 한 번만 받는다.
 * @param {{ deal_id: number, user_id: string }[]} watchRows
 * @param {{ club_code: string, user_id: string }[]} followRows
 * @returns {Map<string, object[]>} userId → 알림(계획 순서 그대로)
 */
export function noticesByUser(notices, watchRows, followRows) {
  const watchers = new Map();
  for (const w of watchRows) (watchers.get(w.deal_id) ?? watchers.set(w.deal_id, new Set()).get(w.deal_id)).add(w.user_id);
  const followers = new Map();
  for (const f of followRows) (followers.get(f.club_code) ?? followers.set(f.club_code, new Set()).get(f.club_code)).add(f.user_id);

  const byUser = new Map();
  for (const n of notices) {
    const users = new Set();
    if (n.toWatchers) for (const u of watchers.get(n.dealId) ?? []) users.add(u);
    if (n.toFollowers) for (const code of n.clubCodes) for (const u of followers.get(code) ?? []) users.add(u);
    for (const u of users) (byUser.get(u) ?? byUser.set(u, []).get(u)).push(n);
  }
  return byUser;
}

/**
 * 한 사람에게 보낼 페이로드 — `MAX_PER_USER`건까지는 딜마다 한 건, 넘으면 한 건으로 묶어 보드로 보낸다.
 * ⚠ 서비스 워커(`public/sw.js`)가 이 모양(`title`·`body`·`url`·`tag`)을 그대로 읽는다 — 키를 바꾸면 그쪽도 함께 고친다.
 */
export function payloadsFor(notices) {
  const pick = ({ title, body, url, tag }) => ({ title, body, url, tag });
  if (notices.length <= MAX_PER_USER) return notices.map(pick);
  return [
    {
      title: `이적 소식 ${notices.length}건`,
      body: notices.slice(0, MAX_PER_USER).map((n) => n.title).join("\n"),
      url: "/transfers",
      tag: "deal-digest",
    },
  ];
}

const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * `column in (values)`인 행을 **끝까지** 읽는다 — 키 하나에 행이 여럿 딸리는 조회라(딜 하나에 관심 여럿, 사용자 하나에 구독
 * 여럿) 한 번의 응답이 `max_rows`에서 **조용히 잘릴 수 있다**(`api-and-db.md`의 PostgREST 절). 잘리면 그 뒤의 사람들에게
 * 알림이 가지 않는데 에러도 로그도 없다. 그래서 정렬을 고정하고 페이지를 넘긴다(`derive-deals.mjs`의 `readAll`과 같은 이유).
 * @param {string[]} orderBy 페이지 사이에 순서가 흔들리지 않게 하는 정렬 — 그 표의 기본키 컬럼들
 */
async function selectIn(supabase, table, columns, column, values, orderBy) {
  const out = [];
  for (const part of chunks([...new Set(values)])) {
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from(table).select(columns).in(column, part);
      for (const key of orderBy) query = query.order(key);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
      out.push(...data);
      if (data.length < PAGE) break;
    }
  }
  return out;
}

/** web-push로 한 건 보낸다 — 테스트·점검은 `opts.send`로 바꿔 끼운다 */
function sendWithWebPush(subscription, payload, vapid) {
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: vapid,
    TTL: TTL_SECONDS,
    // 같은 딜의 밀린 알림은 푸시 서비스에서 최신 것으로 바뀐다(기기가 꺼져 있던 동안의 것)
    topic: payload.tag,
    timeout: SEND_TIMEOUT_MS,
  });
}

/** 정해진 시간 안에 끝나지 않으면 실패로 친다(요청 자체는 web-push의 소켓 타임아웃이 거둔다) */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${ms}ms 안에 끝나지 않았다`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * VAPID 설정이 web-push가 받는 형식인가 — **기록을 넣기 전에** 확인한다. 형식이 틀리면 모든 발송이 던지는데, 그때는
 * 기록이 이미 들어가 그 알림들이 영영 나가지 않는다.
 */
export function assertVapid(vapid) {
  try {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  } catch (e) {
    throw new Error(`VAPID 설정이 올바르지 않습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 기록 → 받는 사람 조회 → 발송 → 죽은 구독 정리.
 *
 * @param {object[]} changes `writeDeals`의 `changes`
 * @param {{ vapid: { subject: string, publicKey: string, privateKey: string }, nowMs?: number, log?: Console,
 *   send?: (subscription: object, payload: object) => Promise<unknown> }} opts
 * @returns {{ planned: number, fresh: number, users: number, sent: number, gone: number, failed: number, rejected: number,
 *   unknownHosts: number, suppressed: number }} `fresh`는 이번에 처음 기록된 알림 수, `suppressed`는 상한에 걸려 기록만 한 수,
 *   `rejected`는 푸시 서비스가 **인증을 거부한** 발송 수(401·403 — VAPID 키가 앱 빌드의 공개키와 다르다는 신호다. 호출부가
 *   실패로 다룬다 — 조용히 지나가면 알림이 한 건도 가지 않는 채로 초록이다)
 */
export async function runNotifications(supabase, changes, opts) {
  const log = opts.log ?? console;
  const send = opts.send ?? ((subscription, payload) => sendWithWebPush(subscription, payload, opts.vapid));
  const stats = { planned: 0, fresh: 0, users: 0, sent: 0, gone: 0, failed: 0, rejected: 0, unknownHosts: 0, suppressed: 0 };

  const planned = planNotices(changes, { nowMs: opts.nowMs ?? Date.now() });
  stats.planned = planned.length;
  if (planned.length === 0) return stats;
  // 실제 발송 경로에서만 검증한다(발송을 바꿔 끼운 테스트·점검은 web-push를 타지 않는다)
  if (!opts.send) assertVapid(opts.vapid);

  // 기록을 먼저 넣는다 — 이미 있는 (딜, 상태)는 무시되고, **새로 들어간 것만** 돌아온다
  const { data: logged, error: logError } = await supabase
    .from("transfer_deal_push_log")
    .upsert(planned.map((n) => ({ deal_id: n.dealId, status: n.status })), { onConflict: "deal_id,status", ignoreDuplicates: true })
    .select("deal_id, status");
  if (logError) throw new Error(`알림 기록 실패: ${logError.message}`);
  const freshKeys = new Set(logged.map((r) => `${r.deal_id}:${r.status}`));
  let fresh = planned.filter((n) => freshKeys.has(`${n.dealId}:${n.status}`));
  stats.fresh = fresh.length;
  if (fresh.length === 0) return stats;

  if (fresh.length > MAX_NOTICES_PER_RUN) {
    // 확정된 소식부터 상한만큼만 보낸다(안정 정렬 — 같은 상태끼리는 계획 순서 그대로). 나머지는 기록만 남는다
    const ranked = [...fresh].sort((a, b) => STATUS_PRIORITY.indexOf(a.status) - STATUS_PRIORITY.indexOf(b.status));
    stats.suppressed = fresh.length - MAX_NOTICES_PER_RUN;
    fresh = ranked.slice(0, MAX_NOTICES_PER_RUN);
    log.warn(`⚠ 알릴 변화가 ${stats.fresh}건(상한 ${MAX_NOTICES_PER_RUN}) — 확정된 소식부터 ${MAX_NOTICES_PER_RUN}건만 보내고 ${stats.suppressed}건은 기록만 했습니다`);
  }

  const [watchRows, followRows] = await Promise.all([
    selectIn(supabase, "transfer_deal_watch", "deal_id, user_id", "deal_id", fresh.filter((n) => n.toWatchers).map((n) => n.dealId), ["deal_id", "user_id"]),
    selectIn(supabase, "transfer_club_follow", "club_code, user_id", "club_code", fresh.filter((n) => n.toFollowers).flatMap((n) => n.clubCodes), ["club_code", "user_id"]),
  ]);
  const byUser = noticesByUser(fresh, watchRows, followRows);
  stats.users = byUser.size;
  if (byUser.size === 0) return stats;

  // 한 계정의 구독 수는 DB가 먼저 막는다(구독 테이블의 상한 트리거) — 여기의 상한은 그 위의 이중 방어다
  const subscriptions = await selectIn(supabase, "profiles_push_subscription", "endpoint, user_id, p256dh, auth, created_at", "user_id", [...byUser.keys()], ["endpoint"]);
  const perUser = new Map();
  for (const s of subscriptions.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const list = perUser.get(s.user_id) ?? perUser.set(s.user_id, []).get(s.user_id);
    if (list.length < MAX_SUBSCRIPTIONS_PER_USER) list.push(s);
  }

  const jobs = [];
  for (const [userId, notices] of byUser) {
    for (const s of perUser.get(userId) ?? []) {
      // ⚠ 판정이 돌려준 **정규화한 주소로만** 보낸다 — 저장된 문자열을 그대로 넘기면 판정한 것과 다른 곳으로 갈 수 있다
      const target = pushEndpointUrl(s.endpoint);
      if (target === null) {
        stats.unknownHosts += 1;
        log.warn(`⚠ 모르는 푸시 서비스라 보내지 않았습니다: ${safeHost(s.endpoint)}`);
        continue;
      }
      for (const payload of payloadsFor(notices)) jobs.push({ subscription: s, target, payload });
    }
  }

  const gone = new Set();
  let next = 0;
  const worker = async () => {
    for (let job = jobs[next++]; job; job = jobs[next++]) {
      // 앞선 알림에서 이미 죽은 구독으로 판정됐다 — 같은 기기에 더 보내지 않는다
      if (gone.has(job.subscription.endpoint)) continue;
      try {
        await withDeadline(
          send({ endpoint: job.target, keys: { p256dh: job.subscription.p256dh, auth: job.subscription.auth } }, job.payload),
          SEND_DEADLINE_MS,
        );
        stats.sent += 1;
      } catch (e) {
        // 404·410 — 브라우저가 구독을 버렸다(로그아웃·권한 회수·앱 삭제). 그 행은 영영 닿지 않으므로 지운다.
        // ⚠ 그 밖의 거부(401·403 — 키 설정 오류일 수 있다)에서는 지우지 않는다. 우리 쪽 설정 실수 한 번에 구독 전부가 사라진다.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          gone.add(job.subscription.endpoint);
        } else {
          stats.failed += 1;
          if (e?.statusCode === 401 || e?.statusCode === 403) stats.rejected += 1;
          log.warn(`⚠ 알림 발송 실패(${e?.statusCode ?? "네트워크"} · ${safeHost(job.subscription.endpoint)}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, jobs.length) }, worker));

  // ⚠ 주소는 한 건이 200자 안팎이라 100개씩 `in()`에 실으면 요청 주소가 게이트웨이 한도를 넘는다 — 작게 묶는다
  const goneList = [...gone];
  for (let i = 0; i < goneList.length; i += DELETE_CHUNK) {
    const part = goneList.slice(i, i + DELETE_CHUNK);
    const { error } = await supabase.from("profiles_push_subscription").delete().in("endpoint", part);
    if (error) log.warn(`⚠ 죽은 구독 정리 실패: ${error.message}`);
    else stats.gone += part.length;
  }
  return stats;
}

/** 로그에는 호스트만 남긴다 — endpoint 전체는 그 기기로 보내는 주소라 로그에 싣지 않는다 */
function safeHost(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return "잘못된 주소";
  }
}
