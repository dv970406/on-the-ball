/**
 * 수집 어댑터의 회귀 테스트 — **글자만 읽는다**는 성질을 고정한다(네트워크 없이 돈다).
 * 사진·영상을 읽기 시작하면 저장·요약(LLM)이 그만큼 무거워진다.
 *
 *   node scripts/test-transfer-sources.mjs
 */
import { resolveAttribution } from "./lib/transfer/attribution.mjs";
import { bylineOf, canonicalGuid, parseTelegram, stripHtml } from "./lib/transfer/sources.mjs";
import { itemExternalId, parseRoundupItems } from "./lib/transfer/roundup.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}

// ── RSS guid — BBC가 고칠 때마다 올리는 개정 번호를 걷는다(같은 기사가 새 행이 됐다) ──
check("guid — 끝의 #숫자(개정 번호)를 걷는다", canonicalGuid("https://www.bbc.co.uk/sport/football/articles/c6r7dy2yyx2xo#3") === "https://www.bbc.co.uk/sport/football/articles/c6r7dy2yyx2xo");
check("guid — 숫자가 아닌 조각은 그대로 둔다", canonicalGuid("https://a.test/x#comments") === "https://a.test/x#comments");
check("guid — URL이 아닌 guid도 그대로 둔다", canonicalGuid("tag:site,2026:123") === "tag:site,2026:123");

// ── RSS 설명 — 태그째 걷는다 ──────────────────────────────────────────────
const rss = stripHtml('<p>Alaba joins Udinese.</p><img src="https://cdn.example.com/alaba.jpg" alt="Alaba signs"><figure><img src="x.png"></figure>');
check("RSS — <img>를 걷어낸다(주소·alt 모두)", rss === "Alaba joins Udinese.", rss);
const encoded = stripHtml("&lt;img src=&quot;https://cdn.example.com/a.jpg&quot;&gt;Deal agreed.");
check("RSS — 인코딩된 <img>도 걷어낸다(엔티티를 먼저 푼다)", encoded === "Deal agreed.", encoded);

// ── 텔레그램 — 본문 영역만 ────────────────────────────────────────────────
const html = `
<div class="tgme_widget_message" data-post="FabrizioRomanoTG/1234">
  <a class="tgme_widget_message_photo_wrap" href="https://t.me/x/1234" style="background-image:url('https://cdn4.telesco.pe/file/photo.jpg')"></a>
  <div class="tgme_widget_message_text">🚨 David Alaba to Udinese, here we go!<br>One year deal.</div>
  <time datetime="2026-09-24T10:00:00+00:00"></time>
</div>`;
const first = parseTelegram(html).msgs[0] ?? null;
check("텔레그램 — 본문 글자를 읽는다", first?.text === "🚨 David Alaba to Udinese, here we go!\nOne year deal.", JSON.stringify(first));
check("텔레그램 — 사진 주소가 본문에 섞이지 않는다", first && !/telesco\.pe|photo\.jpg/.test(first.text));

// ── 기사 byline — 지역지 RSS의 기자 귀속 근거 ────────────────────────────
check("byline — Reach plc 형식 '메일 (이름)'", bylineOf({ author: "football.london@trinitymirror.com (Alasdair Gold)" }) === "Alasdair Gold");
check("byline — dc:creator", bylineOf({ "dc:creator": "Susy Campanale" }) === "Susy Campanale");
check("byline — Atom author.name", bylineOf({ author: { name: "Lee Ryder" } }) === "Lee Ryder");
check("byline — 메일 주소뿐이면 이름이 아니다", bylineOf({ author: "newsdesk@example.com" }) === null);
check("byline — 없으면 null", bylineOf({}) === null);

// ── Bluesky 본인 확인 — 배지가 없어도 확인 근거가 기록돼 있으면 귀속한다 ─────────────
const manual = { kind: "bluesky", tier: 2, defaultAttribution: "verified_author", verification: { issuerHandle: null, method: "byline-links" } };
check("수동 확인 계정 — 본인 글로 귀속", resolveAttribution(manual, { authorHandle: "leeryder.bsky.social" })?.attribution === "verified_author");
check("확인 기록이 없으면 저장하지 않는다(이름만 보고 등록한 계정)", resolveAttribution({ ...manual, verification: undefined }, { authorHandle: "x.bsky.social" }) === null);

// ── 가십 칼럼 → 항목 — 출처 신문 표기로 끝나는 문단만 항목이다(합성 HTML — 실제 기사 문장을 커밋하지 않는다) ──
const bbcColumn = `<html><body><article>
  <p>Chelsea lead race for John Doe, Bayern interested in Jack Roe, and more.</p>
  <p>Chelsea are leading the race to sign Bournemouth midfielder John Doe, 22. (Mail), external</p>
  <p>Bayern Munich are interested in Barcelona forward Jack Roe, 28. (Sport - in Spanish), external</p>
  <p>Newcastle are keeping an eye on Rennes defender Tom Poe, 20. (Marca - in Spanish, external)</p>
  <p>Short one. (Mail), external</p>
  <p>Hibs take winger on trial - Sunday's Scottish gossip</p>
</article></body></html>`;
const bbcItems = parseRoundupItems(bbcColumn);
check("가십 — BBC 문단을 항목으로 나누고 출처 신문을 괄호로 남긴다", JSON.stringify(bbcItems) === JSON.stringify([
  "Chelsea are leading the race to sign Bournemouth midfielder John Doe, 22. (Mail)",
  "Bayern Munich are interested in Barcelona forward Jack Roe, 28. (Sport)",
  "Newcastle are keeping an eye on Rennes defender Tom Poe, 20. (Marca)",
]), JSON.stringify(bbcItems));
const skyBody = "The top stories... <h3>PREMIER LEAGUE</h3><p><strong>Chelsea</strong> have made <strong>John Doe</strong> their top target for January - <em>Daily Mirror</em></p><ul><li><a href=\"x\">Transfer Centre LIVE!</a></li></ul><p><strong>Arsenal</strong> are monitoring <strong>Jack Roe</strong> ahead of the winter window - <em>The Sun</em></p><p>Barcelona are closely monitoring Tom Poe's situation at Chelsea - <em>Sport </em>(Spanish).</p>";
const skyColumn = `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", articleBody: skyBody })}</script></head><body></body></html>`;
const skyItems = parseRoundupItems(skyColumn);
check("가십 — 스카이 articleBody의 HTML 문단을 항목으로 나눈다", JSON.stringify(skyItems) === JSON.stringify([
  "Chelsea have made John Doe their top target for January (Daily Mirror)",
  "Arsenal are monitoring Jack Roe ahead of the winter window (The Sun)",
  "Barcelona are closely monitoring Tom Poe's situation at Chelsea (Sport)",
]), JSON.stringify(skyItems));
check("가십 — 칼럼이 아닌 기사에서는 항목이 없다", parseRoundupItems("<article><p>Chelsea have completed the signing of John Doe from Benfica for a fee of £40m.</p></article>").length === 0);
check("가십 — 항목 키는 칼럼 키 + 본문 해시(같은 본문은 같은 키)", itemExternalId("abc", "x y z") === itemExternalId("abc", "x y z") && itemExternalId("abc", "x y z").startsWith("abc#item-") && itemExternalId("abc", "x") !== itemExternalId("abc", "y"));

console.log(`\n수집 어댑터 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);
