/**
 * 소스 어댑터 — Bluesky · 텔레그램 · RSS.
 *
 * 어댑터의 계약은 `fetch(since)` 하나다: since 이후의 항목을 **가능한 만큼** 가져온다.
 * 소스는 언젠가 죽으므로 경계를 최소로 두고, 그 바깥(추출·귀속·저장)은 전부 파이프라인이 진다.
 *
 * 항목의 모양:
 *   { externalId, url, authorHandle, text, publishedAt(ISO), provenanceUrl }
 */
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { clampCp } from "../sync-db.mjs";

const UA = "Mozilla/5.0 (compatible; on-the-ball-transfer-sync/0.1)";

/**
 * ⚠ 타임아웃을 건다 — 없으면 응답 없는 호스트 하나가 undici 기본값(300초)까지 워커를 붙잡아
 *   정기 실행 한 번이 다음 실행과 겹친다.
 */
const FETCH_TIMEOUT_MS = 20_000;

async function getText(url, label) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${label} ${res.status} ${res.statusText}`);
  return res.text();
}

export function createAdapter(def) {
  switch (def.kind) {
    case "bluesky":
      return (since) => fetchBluesky(def.config, since);
    case "telegram":
      return (since) => fetchTelegram(def.config, since);
    case "rss":
      return (since) => fetchRss(def, since);
    default:
      throw new Error(`알 수 없는 소스 종류: ${def.kind}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Bluesky — 공개 AppView API
//
// ⚠ 이 엔드포인트는 레이트리밋 헤더를 노출하지 않는다. 상한을 알 수 없으므로 보수적으로
//   부르고 429를 관측해야 한다.
// ─────────────────────────────────────────────────────────────────────
const BSKY_API = "https://public.api.bsky.app/xrpc";

async function bskyApi(path, params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const body = await getText(`${BSKY_API}/${path}?${qs}`, `bluesky ${path}`);
  return JSON.parse(body);
}

/** at://did/app.bsky.feed.post/<rkey> → https://bsky.app/profile/<handle>/post/<rkey> */
function bskyWebUrl(handle, uri) {
  const rkey = uri.split("/").pop();
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
}

async function fetchBluesky(cfg, since) {
  const items = [];
  let badDates = 0;
  let cursor;
  // 커서가 없는 최초 수집은 과하게 긁지 않는다
  const maxPages = since ? 10 : 3;

  for (let page = 0; page < maxPages; page++) {
    const params = { actor: cfg.handle, limit: 100, filter: "posts_and_author_threads" };
    if (cursor) params.cursor = cursor;
    const data = await bskyApi("app.bsky.feed.getAuthorFeed", params);
    if (!data.feed?.length) break;

    let reachedSince = false;
    for (const it of data.feed) {
      // `reason`이 있으면 리포스트다 — 본인 글이 아니다
      if (it.reason) continue;
      // ⚠ createdAt은 클라이언트가 정하는 값이다 — 파싱이 안 되면 그 글만 건너뛴다
      //   (그대로 두면 toISOString()이 RangeError로 소스 전체를 죽인다)
      const at = new Date(it.post.record.createdAt);
      if (Number.isNaN(at.getTime())) {
        badDates++;
        continue;
      }
      if (since && at <= since) {
        reachedSince = true;
        continue;
      }
      items.push({
        externalId: it.post.uri,
        url: bskyWebUrl(it.post.author.handle, it.post.uri),
        authorHandle: it.post.author.handle,
        text: it.post.record.text ?? "",
        publishedAt: at.toISOString(),
        // 본인 계정 직접 게시라 별도 출처 링크가 필요 없다
        provenanceUrl: null,
      });
    }
    cursor = data.cursor;
    if (!cursor || reachedSince) break;
  }
  return { items, warnings: badDates ? [`작성 시각을 읽지 못한 글 ${badDates}건을 건너뜀`] : [] };
}

/**
 * 계정 진위 확인. Bluesky 프로필은 검증 가능한 verification 필드를 준다 —
 * 오른스테인은 소속사 The Athletic이 직접 발급한 인증을 갖는다.
 * ⚠ 소스를 새로 등록할 때 반드시 이걸 통과시켜 사칭·미러봇을 걸러낸다.
 */
export async function verifyBlueskyAccount(handle) {
  const p = await bskyApi("app.bsky.actor.getProfile", { actor: handle });
  const v = p.verification;
  return {
    handle: p.handle,
    followersCount: p.followersCount,
    verifiedStatus: v?.verifiedStatus ?? null,
    issuerHandle: v?.verifications?.find((x) => x.isValid)?.issuerHandle ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 텔레그램 — 공개 채널 미리보기(t.me/s/<channel>)
//
// 자격증명도 채널 가입도 필요 없다. 한 페이지에 최근 20건이 실리고 ?before=<id>로 과거로 간다.
// ⚠ 원본 트윗 퍼머링크는 대소문자가 계정 표기를 따른다(x.com/FabrizioRomano).
//   반드시 대소문자 무시로 매칭할 것 — 놓치면 출처 링크 보유율을 0%로 오판한다.
// ─────────────────────────────────────────────────────────────────────
const TWEET_PERMALINK = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/i;

function telegramPage(channel, before) {
  const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
  return getText(url, `telegram ${channel}`);
}

/** @returns {{ msgs: object[], badDates: number }} */
function parseTelegram(html) {
  const $ = cheerio.load(html);
  const out = [];
  let badDates = 0;

  $(".tgme_widget_message").each((_, el) => {
    const $el = $(el);
    const id = Number($el.attr("data-post")?.split("/").pop());
    if (!Number.isFinite(id)) return;

    const time = $el.find("time[datetime]").attr("datetime");
    if (!time) return;
    // ⚠ 파싱되지 않는 시각은 그 메시지만 버린다 — 그대로 두면 toISOString()이 RangeError로
    //   채널 전체를 죽인다(Bluesky의 createdAt과 같은 방어)
    const at = new Date(time);
    if (Number.isNaN(at.getTime())) {
      badDates++;
      return;
    }

    // <br>을 줄바꿈으로 보존하며 본문 추출
    const $text = $el.find(".tgme_widget_message_text").first();
    $text.find("br").replaceWith("\n");
    const text = $text.text().trim();
    if (!text) return;

    // 원본 게시물 퍼머링크 — 귀속 증거이자 안정적인 중복 키다
    let provenanceUrl = null;
    let provenanceAuthor = null;
    $el.find("a[href]").each((_, a) => {
      if (provenanceUrl) return;
      const href = $(a).attr("href") ?? "";
      const m = href.match(TWEET_PERMALINK);
      if (m) {
        provenanceUrl = href;
        provenanceAuthor = m[1].toLowerCase();
      }
    });

    out.push({ id, publishedAt: at.toISOString(), text, provenanceUrl, provenanceAuthor });
  });

  return { msgs: out.sort((a, b) => a.id - b.id), badDates };
}

async function fetchTelegram(cfg, since) {
  const warnings = [];
  const seen = new Map();
  let before;
  let badDates = 0;
  const maxPages = since ? 8 : 3;

  for (let page = 0; page < maxPages; page++) {
    const parsed = parseTelegram(await telegramPage(cfg.channel, before));
    const msgs = parsed.msgs;
    badDates += parsed.badDates;
    if (!msgs.length) break;
    for (const m of msgs) seen.set(m.id, m);

    const oldest = msgs[0];
    if (since && new Date(oldest.publishedAt) <= since) break;
    if (before !== undefined && oldest.id >= before) {
      warnings.push("페이지네이션이 진행되지 않아 중단했다");
      break;
    }
    before = oldest.id;
  }

  const items = [];
  for (const m of [...seen.values()].sort((a, b) => b.id - a.id)) {
    if (since && new Date(m.publishedAt) <= since) continue;
    items.push({
      // 퍼머링크가 있으면 원본 트윗 id를 키로 쓴다 — 채널이 지웠다 다시 올려도 같은 키다
      externalId: m.provenanceUrl ? `tweet:${m.provenanceUrl.match(TWEET_PERMALINK)[2]}` : `${cfg.channel}/${m.id}`,
      url: `https://t.me/${cfg.channel}/${m.id}`,
      authorHandle: m.provenanceAuthor ?? (cfg.official ? cfg.channel : null),
      text: m.text,
      publishedAt: m.publishedAt,
      provenanceUrl: m.provenanceUrl,
    });
  }
  if (badDates) warnings.push(`게시 시각을 읽지 못한 메시지 ${badDates}건을 건너뜀`);
  return { items, warnings };
}

/**
 * 채널 출처 신뢰도 점검.
 * 실측(2026-08-29): fabrizioromanotg → 퍼머링크 94% / David_Ornstein → 0%, 소개에 "*Unofficial".
 */
export async function inspectTelegramChannel(channel) {
  const html = await telegramPage(channel);
  const $ = cheerio.load(html);
  const description = $(".tgme_channel_info_description").first().text().trim() || null;
  const { msgs } = parseTelegram(html);
  return {
    channel,
    title: $(".tgme_channel_info_header_title").first().text().trim() || null,
    declaresUnofficial: /unofficial/i.test(description ?? ""),
    permalinkRatio: msgs.length ? msgs.filter((m) => m.provenanceUrl).length / msgs.length : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// RSS / Atom
// ─────────────────────────────────────────────────────────────────────
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  // ⚠ Guardian 피드는 엔티티가 2,700개를 넘어 파서의 기본 확장 한도(1,000)에 걸린다.
  //   엔티티 확장은 XML 폭탄 벡터이기도 하므로 파서에 맡기지 않고 직접 디코딩한다.
  processEntities: false,
});

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * ⚠ 텍스트 노드가 없는 요소(`<source url="…"/>`, `<title><b>x</b></title>`)는 파서가 객체로 준다 —
 *   `String(객체)`는 `"[object Object]"`라 그 문자열이 저자·본문으로 저장된다(원본 크롤러의 결함).
 */
function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return "#text" in v ? String(v["#text"] ?? "") : "";
  return String(v);
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  eacute: "é", egrave: "è", uuml: "ü", ouml: "ö", auml: "ä",
  ccedil: "ç", ntilde: "ñ", oslash: "ø", aring: "å",
};

/** 파서의 processEntities를 껐으므로 엔티티를 직접 디코딩한다 */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeCodePoint(parseInt(h, 16)) ?? m)
    .replace(/&#(\d+);/g, (m, d) => safeCodePoint(Number(d)) ?? m)
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * ⚠ 범위 밖 코드포인트(`&#99999999;`)는 `String.fromCodePoint`가 RangeError로 던져 피드 전체가 죽는다.
 * ⚠ `&#0;`도 풀지 않는다 — Postgres text는 NUL을 받지 않아(22P05) 그 행이 통째로 거부된다.
 */
function safeCodePoint(n) {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null;
}

/**
 * HTML 태그와 엔티티를 걷어낸 평문.
 *
 * ⚠ **엔티티를 먼저 풀고 태그를 지운다.** Google News·Guardian의 description은 HTML이
 *   `&lt;a href=…&gt;`로 **인코딩되어** 온다 — 태그를 먼저 지우면 걸리는 것이 없고, 디코딩이
 *   그 뒤에 `<a href=…>`를 되살려 본문에 마크업이 그대로 남는다(크롤러가 그 상태로 저장했다).
 */
function stripHtml(s) {
  return decodeEntities(s).replace(HTML_TAG, " ").replace(/\s+/g, " ").trim();
}

/**
 * ⚠ `<` 바로 뒤에 글자(또는 `/`·`!--`)가 와야 태그로 본다. `<[^>]+>`로 두면 평문 피드의
 *   `Fee &lt; £50m but &gt; £40m`이 디코딩 뒤 `<` ~ `>` 구간째 지워져 **"Fee £40m"** 이
 *   된다 — 본문도 이적료도 바뀌는데, 원문은 트리거가 고정하므로 되살릴 수 없다.
 */
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[a-z][^<>]*>/gi;

/**
 * RSS에 실제로 등장하는 타임존 약어 → 오프셋.
 * ⚠ JS Date는 GMT/UTC 외의 약어를 파싱하지 못한다. Sky Sports가 "… 19:00:00 BST"를 쓰는데
 *   이걸 처리하지 않으면 피드 전량이 조용히 버려진다(크롤러에서 20건이 실제로 유실됐다).
 */
const TZ_ABBR = {
  GMT: "+0000", UTC: "+0000", UT: "+0000", Z: "+0000",
  BST: "+0100", IST: "+0100",
  CET: "+0100", CEST: "+0200", MET: "+0100", MEST: "+0200",
  EET: "+0200", EEST: "+0300",
  EST: "-0500", EDT: "-0400", CST: "-0600", CDT: "-0500",
  MST: "-0700", MDT: "-0600", PST: "-0800", PDT: "-0700",
};

function parseFeedDate(s) {
  if (!s) return null;
  const raw = s.trim();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return fixMislabeledDst(raw, direct);

  const m = raw.match(/\s([A-Z]{1,4})$/);
  const offset = m && TZ_ABBR[m[1].toUpperCase()];
  if (offset) {
    const retry = new Date(raw.replace(/\s[A-Z]{1,4}$/, ` ${offset}`));
    if (!Number.isNaN(retry.getTime())) return retry;
  }
  return null;
}

/**
 * 서머타임 기간에 **표준시 약어를 붙이는 피드**를 바로잡는다.
 *
 * ⚠ ESPN은 9월(EDT, UTC-4)에도 "10:02:11 EST"라고 쓴다(실측). 그대로 읽으면 UTC-5라 한 시간 뒤의
 *   시각이 되어, 방금 올라온 기사가 **미래 시각**으로 걸러졌다(20건 중 9건). 한 시간 뒤에 들어오긴
 *   하지만 시각이 1시간 틀린 채로 저장된다.
 * ⚠ 판정은 "해석한 시각이 지금보다 미래인가"다 — 표준시 약어가 맞는 겨울에는 미래가 되지 않으므로
 *   그대로 두고, 미래일 때만 같은 지역의 서머타임(한 시간 이르게)으로 다시 읽는다.
 */
const US_STANDARD = /\s(EST|CST|MST|PST)$/;
function fixMislabeledDst(raw, parsed) {
  if (!US_STANDARD.test(raw) || parsed.getTime() <= Date.now()) return parsed;
  const shifted = new Date(parsed.getTime() - 3_600_000);
  return shifted.getTime() <= Date.now() + 60_000 ? shifted : parsed;
}

function entryLink(e) {
  const raw = e.link;
  if (typeof raw === "string") return raw;
  // Atom은 link가 속성으로 온다
  if (Array.isArray(raw)) {
    const alt = raw.find((l) => l && typeof l === "object" && l["@_rel"] !== "self");
    return alt ? String(alt["@_href"] ?? "") || null : null;
  }
  if (raw && typeof raw === "object") {
    if (raw["@_href"]) return String(raw["@_href"]);
    if (raw["#text"]) return String(raw["#text"]);
  }
  return null;
}

async function fetchRss(def, since) {
  const warnings = [];
  const body = await getText(def.config.url, `rss ${def.id}`);
  const doc = xml.parse(body);
  const entries = [
    ...asArray(doc?.rss?.channel?.item),
    ...asArray(doc?.feed?.entry),
    ...asArray(doc?.["rdf:RDF"]?.item),
  ];
  if (!entries.length) {
    // ⚠ 응답 앞부분을 함께 남긴다 — 로컬에선 멀쩡한 피드가 GitHub 러너(데이터센터 IP)에서만 0건이었다.
    //   피드 구조 변경인지, 봇 차단 페이지(200 + HTML)인지는 응답을 봐야 가를 수 있다.
    const head = clampCp(body.replace(/\s+/g, " ").trim(), 120);
    warnings.push(`항목을 찾지 못했다 — 피드 구조 변경 또는 차단일 수 있다(${body.length}B: ${head})`);
  }

  const items = [];
  for (const e of entries) {
    const link = entryLink(e);
    const guid = textOf(e.guid) || textOf(e.id) || link;
    if (!guid) continue;

    const published = parseFeedDate(textOf(e.pubDate)) ?? parseFeedDate(textOf(e.published)) ?? parseFeedDate(textOf(e.updated));
    if (!published) {
      warnings.push(`날짜 없는 항목 건너뜀: ${clampCp(textOf(e.title), 40)}`);
      continue;
    }
    if (since && published <= since) continue;

    const title = stripHtml(textOf(e.title));
    const body = stripHtml(textOf(e.description) || textOf(e.summary) || textOf(e.content));
    // 제목이 곧 본문인 피드가 많다 — 같으면 제목만 남긴다
    const text = body && body !== title ? `${title}\n\n${body}` : title;

    items.push({
      // guid가 URL이든 임의 문자열이든 길이가 들쭉날쭉해 해시로 고정한다
      externalId: createHash("sha1").update(guid).digest("hex").slice(0, 20),
      url: link,
      // Google News는 <source>에 원 매체명이 온다("The Times &amp; The Sunday Times"처럼 인코딩돼서)
      authorHandle: stripHtml(textOf(e.source)) || null,
      text,
      publishedAt: published.toISOString(),
      provenanceUrl: link,
    });
  }
  return { items, warnings };
}
