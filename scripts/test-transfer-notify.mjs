/**
 * 알림 발송(`notify.mjs`)과 구단 표 채우기의 회귀 테스트 — DB도 푸시 서비스도 부르지 않는다(가짜 DB · 가짜 발송).
 *
 *   node scripts/test-transfer-notify.mjs
 */
import { readFileSync } from "node:fs";
import { presetClubs } from "./lib/transfer/club-display.mjs";
import { clubRowsToWrite } from "./lib/transfer/derive-deals.mjs";
import {
  MAX_NOTICES_PER_RUN,
  MAX_PER_USER,
  NOTICE_MAX_AGE_MS,
  ROUTE_CLUB_LIMIT,
  STATUS_LABEL,
  STATUS_OF_STAGE,
  isPushEndpoint,
  noticesByUser,
  payloadsFor,
  assertVapid,
  planNotices,
  pushEndpointUrl,
  runNotifications,
} from "./lib/transfer/notify.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 화면과의 정합 — 상태 톤 표는 TS(`stage.ts`)의 사본이다 ─────────────────────────
/** TS 소스에서 `export const NAME: … = { … };` 객체 리터럴의 `키: "값"`·`키: null` 쌍을 읽는다 */
function readTsRecord(source, name) {
  const body = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(source)?.[1];
  if (!body) return null;
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*(?:"([^"]*)"|(null)),/gm)) out[m[1]] = m[3] ? null : m[2];
  return out;
}
const stageTs = readFileSync(new URL("../src/entities/transfer/lib/stage.ts", import.meta.url), "utf8");
check("정합 — 단계 → 상태 톤 표가 화면(stage.ts의 STAGE_STATUS)과 같다", eq(readTsRecord(stageTs, "STAGE_STATUS"), STATUS_OF_STAGE), JSON.stringify(readTsRecord(stageTs, "STAGE_STATUS")));
check("정합 — 상태 라벨이 화면(stage.ts의 STATUS_LABEL)과 같다", eq(readTsRecord(stageTs, "STATUS_LABEL"), STATUS_LABEL), JSON.stringify(readTsRecord(stageTs, "STATUS_LABEL")));

// 경로 문구도 화면(`route-label.ts`)의 사본이다 — 이름을 적는 구단 수와 빈 칸의 낱말이 갈리면 알림과 화면이 다른 말을 한다
const routeTs = readFileSync(new URL("../src/entities/transfer/lib/route-label.ts", import.meta.url), "utf8");
check("정합 — 행선지에 이름을 적는 구단 수가 화면(route-label.ts의 ROUTE_CLUB_LIMIT)과 같다", Number(/export const ROUTE_CLUB_LIMIT = (\d+);/.exec(routeTs)?.[1]) === ROUTE_CLUB_LIMIT);
check("정합 — 빈 칸의 낱말(FA·미확인·미정·외 N)이 화면의 것과 같다", ['"FA"', '"미확인"', '"미정"', "외 ${rest}", '" · "'].every((word) => routeTs.includes(word)), "route-label.ts의 문구가 바뀌었다 — notify.mjs의 destinationLabel·planNotices를 함께 고친다");

// ── 계획 ────────────────────────────────────────────────────────────────
const NOW = Date.parse("2026-10-05T12:00:00Z");
const change = (over = {}) => ({
  dealId: 1,
  prevStage: "rumour",
  stage: "talks",
  player: "Yankuba Minteh",
  playerKo: "얀쿠바 민테",
  fromShort: "브라이턴",
  toShorts: ["리버풀"],
  isFreeAgent: false,
  clubCodes: ["brighton-hove", "liverpool"],
  latestReportedAt: "2026-10-05T11:00:00Z",
  summary: null,
  ...over,
});
const plan = (...cs) => planNotices(cs, { nowMs: NOW });

{
  const [n] = plan(change());
  check("상태 변화 — 루머 → 협상은 관심 등록자에게만 알린다(구단 팬에게는 소음)", n && eq([n.status, n.toWatchers, n.toFollowers, n.isNew], ["talks", true, false, false]), JSON.stringify(n));
  check("문구 — 제목은 뱃지 글자 · 선수, 본문은 경로, 주소는 상세", n && eq([n.title, n.body, n.url, n.tag], ["협상 중 · 얀쿠바 민테", "브라이턴 → 리버풀", "/transfers/1", "deal-1"]), JSON.stringify(n));
}
check("같은 톤 안의 이동(제안 → 협상 · 메디컬 → 개인 합의)은 알리지 않는다", plan(change({ prevStage: "offer", stage: "talks" }), change({ prevStage: "medical", stage: "personal_terms" })).length === 0);
check("진전 — 합의 임박·합의 완료·오피셜은 구단 팬에게도 알린다", eq(plan(change({ stage: "agreement" }), change({ stage: "here_we_go" }), change({ stage: "official" })).map((n) => [n.status, n.toFollowers]), [["imminent", true], ["hwg", true], ["official", true]]));
check("결렬·부인은 관심 등록자에게만 알린다", eq(plan(change({ prevStage: "talks", stage: "collapsed" }), change({ stage: "denied" })).map((n) => [n.status, n.toWatchers, n.toFollowers]), [["dead", true, false], ["denied", true, false]]));
{
  const [n] = plan(change({ prevStage: null, stage: "rumour" }));
  check("새 딜 — 구단 팬에게만 간다(담은 사람이 아직 없다) · 새 루머의 제목은 '새 이적설'", n && eq([n.isNew, n.toWatchers, n.toFollowers, n.title], [true, false, true, "새 이적설 · 얀쿠바 민테"]), JSON.stringify(n));
  const [official] = plan(change({ prevStage: null, stage: "official" }));
  check("새 딜 — 곧바로 오피셜로 열린 딜은 그 상태로 알린다", official?.title === "오피셜 · 얀쿠바 민테" && official.toFollowers);
}
check("오래된 보도로 생긴 변화는 알리지 않는다(수집이 멎었다 돌아온 뒤의 밀린 소식)", plan(change({ latestReportedAt: new Date(NOW - NOTICE_MAX_AGE_MS - 1).toISOString() })).length === 0 && plan(change({ latestReportedAt: new Date(NOW - NOTICE_MAX_AGE_MS + 60_000).toISOString() })).length === 1);
check("시각을 읽지 못한 변화는 버린다", plan(change({ latestReportedAt: "어제" })).length === 0);
{
  const [n] = plan(change({ playerKo: null, fromShort: null, toShorts: [], summary: "민테가 이적을 원한다." }));
  check("문구 — 한국어 표기가 없으면 영문명, 빈 칸은 화면과 같은 말(미확인·미정), 요약이 있으면 둘째 줄", n && eq([n.title, n.body], ["협상 중 · Yankuba Minteh", "미확인 → 미정\n민테가 이적을 원한다."]), JSON.stringify(n));
  const [fa] = plan(change({ fromShort: null, isFreeAgent: true, toShorts: ["A", "B", "C", "D", "E"] }));
  check("문구 — 자유계약의 출발은 FA, 행선지가 넷 이상이면 앞 셋 + 외 N", fa?.body === "FA → A · B · C 외 2", fa?.body);
}

// ── 받는 사람 ────────────────────────────────────────────────────────────
{
  const notices = plan(change({ dealId: 1, stage: "official" }), change({ dealId: 2, prevStage: "talks", stage: "collapsed", clubCodes: ["arsenal"] }));
  const byUser = noticesByUser(
    notices,
    [{ deal_id: 1, user_id: "u1" }, { deal_id: 2, user_id: "u2" }],
    [{ club_code: "liverpool", user_id: "u1" }, { club_code: "liverpool", user_id: "u3" }, { club_code: "arsenal", user_id: "u3" }],
  );
  check("받는 사람 — 관심으로도 응원 구단으로도 걸린 딜은 한 번만 받는다", eq(byUser.get("u1")?.map((n) => n.dealId), [1]));
  check("받는 사람 — 결렬은 그 구단 팬에게 가지 않는다(관심 등록자만)", eq(byUser.get("u2")?.map((n) => n.dealId), [2]) && eq(byUser.get("u3")?.map((n) => n.dealId), [1]));
}

// ── 페이로드 ─────────────────────────────────────────────────────────────
{
  const many = Array.from({ length: MAX_PER_USER + 2 }, (_, i) => plan(change({ dealId: i + 1, stage: "official" }))[0]);
  const few = payloadsFor(many.slice(0, MAX_PER_USER));
  check("페이로드 — 상한까지는 딜마다 한 건(서비스 워커가 읽는 네 키만 싣는다)", few.length === MAX_PER_USER && eq(Object.keys(few[0]), ["title", "body", "url", "tag"]));
  const digest = payloadsFor(many);
  check("페이로드 — 상한을 넘으면 한 건으로 묶어 보드로 보낸다", digest.length === 1 && eq([digest[0].title, digest[0].url, digest[0].tag, digest[0].body.split("\n").length], [`이적 소식 ${MAX_PER_USER + 2}건`, "/transfers", "deal-digest", MAX_PER_USER]), JSON.stringify(digest));
}

// ── 푸시 서비스 호스트 ─────────────────────────────────────────────────────
check("호스트 — 크롬(FCM)·파이어폭스·사파리·엣지의 푸시 서비스만 받는다", ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"].every(isPushEndpoint));
check("호스트 — 그 밖의 주소·http·비슷한 이름의 호스트는 거른다", ["https://evil.example/hook", "http://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com.evil.example/x", "https://notpush.apple.com.evil.io/x", "https://127.0.0.1/x", "not a url"].every((u) => !isPushEndpoint(u)));
// 발송 라이브러리는 Node의 옛 url.parse로 접속한다 — 두 파서가 호스트를 다르게 읽는 주소가 목록을 통과하면 엉뚱한 서버로 요청이 간다
check(
  "호스트 — 판정과 발송의 파서가 갈리는 주소(구분 문자·역슬래시·계정 정보·다른 포트)를 거른다",
  [
    "https://evil.example;.push.apple.com/x",
    "https://evil.example'.push.services.mozilla.com/x",
    'https://evil.example".notify.windows.com/x',
    "https://evil.example`.push.apple.com/x",
    "https://evil.example{.push.apple.com/x",
    "https://\\fcm.googleapis.com/x",
    "https://evil.example\\@fcm.googleapis.com/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://fcm.googleapis.com",
    "https://evil.example/#.push.apple.com/",
    "https://evil.example/?.push.apple.com/",
  ].every((u) => pushEndpointUrl(u) === null),
);
check("호스트 — 통과한 주소는 정규화해 돌려준다(발송은 이 값으로만 한다)", pushEndpointUrl("https://FCM.googleapis.com/fcm/send/abc") === "https://fcm.googleapis.com/fcm/send/abc" && pushEndpointUrl("https://web.push.apple.com:443/abc") === "https://web.push.apple.com/abc");
check("VAPID — 형식이 틀린 설정은 기록 전에 던진다(연락처가 mailto·https가 아니다 · 키가 아니다)", [{ subject: "admin@example.com", publicKey: "x", privateKey: "y" }, { subject: "mailto:a@example.com", publicKey: "짧다", privateKey: "짧다" }].every((v) => { try { assertVapid(v); return false; } catch { return true; } }));

// ── 발송 흐름 — 가짜 DB ────────────────────────────────────────────────────
/** PostgREST `max_rows` — 응답 한 번은 이 수에서 **에러 없이** 잘린다 */
const MAX_ROWS = 1000;

/** `transfer_deal_push_log`에 이미 있는 키·관심·응원 구단·구독을 넣어 두는 가짜 DB. 쓴 것을 `log`에 모은다 */
function fakeDb({ logged = [], watches = [], follows = [], subscriptions = [] } = {}) {
  const existing = new Set(logged);
  const log = { inserted: [], deleted: [], selects: [] };
  const tables = { transfer_deal_watch: watches, transfer_club_follow: follows, profiles_push_subscription: subscriptions };
  return {
    log,
    from: (table) => ({
      upsert: (rows) => ({
        select: async () => {
          const fresh = rows.filter((r) => !existing.has(`${r.deal_id}:${r.status}`));
          for (const r of fresh) existing.add(`${r.deal_id}:${r.status}`);
          log.inserted.push(...fresh);
          return { data: fresh, error: null };
        },
      }),
      // 실제 호출 모양 그대로다: select().in().order()…range(from, to) — 서버처럼 `MAX_ROWS`에서 조용히 자른다
      select: () => ({
        in: (column, values) => {
          const matched = tables[table].filter((r) => values.includes(r[column]));
          const builder = {
            order: () => builder,
            range: async (from, to) => {
              log.selects.push(table);
              return { data: matched.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null };
            },
          };
          return builder;
        },
      }),
      delete: () => ({
        in: async (_column, values) => {
          log.deleted.push(...values);
          return { error: null };
        },
      }),
    }),
  };
}
const sub = (userId, n, over = {}) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${n}`, user_id: userId, p256dh: "p", auth: "a", created_at: `2026-10-0${n}T00:00:00Z`, ...over });
const quiet = { warn: () => {}, error: () => {}, log: () => {} };
const VAPID = { subject: "mailto:test@example.com", publicKey: "pub", privateKey: "priv" };

{
  const db = fakeDb({ watches: [{ deal_id: 1, user_id: "u1" }], subscriptions: [sub("u1", 1), sub("u1", 2)] });
  const sent = [];
  const stats = await runNotifications(db, [change()], { vapid: VAPID, nowMs: NOW, log: quiet, send: async (s, p) => { sent.push([s.endpoint, p.title]); } });
  check("발송 — 기록을 넣고, 관심 등록자의 모든 기기에 보낸다", eq([stats.planned, stats.fresh, stats.users, stats.sent], [1, 1, 1, 2]) && eq(db.log.inserted, [{ deal_id: 1, status: "talks" }]) && sent.length === 2 && sent.every(([, title]) => title === "협상 중 · 얀쿠바 민테"), JSON.stringify([stats, sent]));
  check("발송 — 구독에서 꺼낸 키를 web-push 모양으로 넘긴다(endpoint + keys)", sent.every(([endpoint]) => endpoint.startsWith("https://fcm.googleapis.com/")));

  const again = await runNotifications(db, [change()], { vapid: VAPID, nowMs: NOW, log: quiet, send: async () => { throw new Error("보내면 안 된다"); } });
  check("중복 — 이미 알린 (딜, 상태)는 다시 보내지 않는다", eq([again.planned, again.fresh, again.sent], [1, 0, 0]));
}
{
  const db = fakeDb({ watches: [{ deal_id: 1, user_id: "u1" }], subscriptions: [sub("u1", 1), sub("u1", 2), sub("u1", 3, { endpoint: "https://evil.example/hook" })] });
  const stats = await runNotifications(db, [change()], {
    vapid: VAPID, nowMs: NOW, log: quiet,
    send: async (s) => {
      if (s.endpoint.endsWith("u1-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("u1-2")) throw Object.assign(new Error("forbidden"), { statusCode: 403 });
    },
  });
  check("정리 — 410을 받은 구독만 지운다(403은 우리 쪽 설정 오류일 수 있어 남긴다)", eq(db.log.deleted, ["https://fcm.googleapis.com/fcm/send/u1-1"]) && eq([stats.gone, stats.failed, stats.sent], [1, 1, 0]), JSON.stringify([stats, db.log.deleted]));
  check("인증 거부 — 401·403은 따로 센다(호출부가 설정 오류로 보고 실패로 올린다)", stats.rejected === 1, JSON.stringify(stats));
  check("호스트 — 모르는 푸시 서비스의 구독에는 요청을 보내지 않는다", stats.unknownHosts === 1);
}
{
  const db = fakeDb({ follows: [{ club_code: "liverpool", user_id: "u9" }], subscriptions: [sub("u9", 1)] });
  const sent = [];
  const changes = Array.from({ length: MAX_PER_USER + 1 }, (_, i) => change({ dealId: 10 + i, prevStage: null, stage: "rumour" }));
  const stats = await runNotifications(db, changes, { vapid: VAPID, nowMs: NOW, log: quiet, send: async (_s, p) => { sent.push(p); } });
  check("묶음 — 한 사람에게 갈 알림이 상한을 넘으면 한 건으로 보낸다", stats.sent === 1 && sent[0].tag === "deal-digest", JSON.stringify([stats, sent]));
}
{
  const changes = Array.from({ length: MAX_NOTICES_PER_RUN + 1 }, (_, i) => change({ dealId: 100 + i, prevStage: null, stage: "rumour" }));
  // 루머가 상한보다 많고 그 뒤에 오피셜이 하나 — 계획 순서로 자르면 오피셜이 잘린다
  changes.push(change({ dealId: 999, prevStage: "talks", stage: "official" }));
  const sent = [];
  const stats = await runNotifications(
    fakeDb({ follows: [{ club_code: "liverpool", user_id: "u9" }], watches: [{ deal_id: 999, user_id: "u8" }], subscriptions: [sub("u9", 1), sub("u8", 1)] }),
    changes,
    { vapid: VAPID, nowMs: NOW, log: quiet, send: async (s, p) => { sent.push([s.endpoint.slice(-4), p.title]); } },
  );
  check("상한 — 한 실행의 변화가 상한을 넘으면 확정된 소식부터 상한만큼만 보내고 나머지는 기록만 한다", stats.fresh === MAX_NOTICES_PER_RUN + 2 && stats.suppressed === 2 && sent.some(([who, title]) => who === "u8-1" && title === "오피셜 · 얀쿠바 민테"), JSON.stringify([stats, sent]));
}
{
  // 한 건이 응답을 붙잡고 끝내지 않아도(느린 서버) 전체가 멎지 않는다 — 시간 안에 안 끝나면 실패로 치고 넘어간다
  const db = fakeDb({ watches: [{ deal_id: 1, user_id: "u1" }], subscriptions: [sub("u1", 1)] });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 5, ...args); // 기다리는 시간을 줄인다(판정은 그대로다)
  const stats = await runNotifications(db, [change()], { vapid: VAPID, nowMs: NOW, log: quiet, send: () => new Promise(() => {}) }).finally(() => { globalThis.setTimeout = realSetTimeout; });
  check("시간 상한 — 끝나지 않는 발송은 실패로 치고 넘어간다", stats.sent === 0 && stats.failed === 1, JSON.stringify(stats));
}
{
  const db = fakeDb();
  const stats = await runNotifications(db, [change({ prevStage: "offer", stage: "talks" })], { vapid: VAPID, nowMs: NOW, log: quiet, send: async () => {} });
  check("알릴 것이 없으면 DB를 건드리지 않는다", stats.planned === 0 && db.log.inserted.length === 0 && db.log.selects.length === 0);
}

{
  // 한 딜을 담은 사람이 응답 한 번의 상한(max_rows)보다 많다 — 페이지를 넘기지 않으면 뒤쪽 사람들이 에러 없이 빠진다
  const watchers = Array.from({ length: MAX_ROWS + 250 }, (_, i) => ({ deal_id: 1, user_id: `w${i}` }));
  const db = fakeDb({ watches: watchers, subscriptions: watchers.map((w, i) => sub(w.user_id, 1, { endpoint: `https://fcm.googleapis.com/fcm/send/many-${i}` })) });
  let sent = 0;
  const stats = await runNotifications(db, [change()], { vapid: VAPID, nowMs: NOW, log: quiet, send: async () => { sent += 1; } });
  check("잘림 — 받는 사람이 응답 한 번의 상한을 넘어도 끝까지 읽어 전부에게 보낸다", stats.users === MAX_ROWS + 250 && sent === MAX_ROWS + 250, JSON.stringify(stats));
}

// ── 구단 표 — 프리셋 구단 전부를 쓴다(응원 구단이 딜 없는 구단도 고를 수 있게) ───────────────
{
  const rows = clubRowsToWrite([]);
  check("구단 표 — 파생에 나온 구단이 없어도 프리셋 구단 전부가 행이 된다(전부 리그가 있다)", rows.length === presetClubs().length && rows.every((c) => c.league !== null) && new Set(rows.map((c) => c.code)).size === rows.length, String(rows.length));
  const extra = { code: "sturm-graz", canonical: "Sturm Graz", name: "SK 슈투름 그라츠", short_name: "슈투름 그라츠", league: null };
  const arsenal = { ...rows.find((c) => c.code === "arsenal"), name: "이번 파생의 값" };
  const merged = clubRowsToWrite([extra, arsenal]);
  check("구단 표 — 프리셋 밖 구단은 더해지고, 같은 코드는 이번 파생의 값이 이긴다", merged.length === rows.length + 1 && merged.find((c) => c.code === "arsenal").name === "이번 파생의 값" && merged.some((c) => c.code === "sturm-graz"));
}

console.log(`\n알림 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);
