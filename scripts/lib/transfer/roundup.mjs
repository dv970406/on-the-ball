/**
 * 가십 칼럼(BBC 이적 가십 · 스카이 신문 요약)을 **항목별 보도**로 나눈다.
 *
 * 가십 칼럼은 여러 신문의 이적설을 한 문단씩 모은 글이라, 통째로는 딜 후보가 될 수 없다(한 선수의 이야기로
 * 읽으면 남의 구단·금액이 섞인다 — `story.mjs`의 `isRoundup`). 그런데 RSS에 실리는 것은 제목과 요약 한 줄뿐이라
 * 칼럼 안의 이적설 대부분이 보드에 닿지 못했다 — 정답 세트의 이동 보도 선수 73명 중 50명이 가십 칼럼에만 있었다.
 * 그래서 칼럼 본문을 받아 **한 문단 = 한 보도**로 저장한다. 문단 하나는 한 이적설이라 기존 파이프라인
 * (추출·검증·판정·요약·타임라인)을 그대로 탄다.
 *
 * ⚠ 항목 행은 칼럼 행의 **자식**이다 — `external_id`가 `<칼럼 external_id>#item-<해시>`이고 URL·게시 시각·귀속을
 *   칼럼에서 물려받는다. 그래서 URL로 중복을 합치면 항목이 전부 한 보도로 접힌다 → 중복 판정은 항목 행의 URL을
 *   보지 않는다(`derive-deals.mjs`의 `dedupeRows`). 같은 칼럼이 두 피드(BBC Sport · BBC 이적 가십)에 실리면 항목이
 *   두 벌 생기는데, 본문이 같아 본문 키로 합쳐진다.
 * ⚠ 항목은 **다시 받지 않는다** — 칼럼마다 한 번 받아 나눈다(항목 행이 하나라도 있으면 끝난 칼럼이다).
 * ⚠ 항목 끝에 출처 신문을 괄호로 남긴다("(Telegraph)") — 칼럼이 인용한 원 보도의 주체라, 요약·판정이 누구의
 *   주장인지 읽을 수 있다. 괄호 안 한 낱말은 선수 이름 추출에 걸리지 않는다(회귀 테스트).
 *   그리고 **귀속이 그 신문이다**(`citedOutlet` → `attribution.mjs`의 `cited`). 칼럼 매체로 귀속하면 타블로이드
 *   이적설이 BBC 🎖️로 그려진다(운영에서 실제로 그랬다).
 */
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { ITEM_MARK } from "./story.mjs";

/** 항목 행의 external_id — 본문으로 만든다(칼럼이 문단 순서를 바꿔도 같은 항목은 같은 키다) */
export const itemExternalId = (parentId, text) => `${parentId}${ITEM_MARK}${createHash("sha1").update(text).digest("hex").slice(0, 12)}`;

/**
 * 항목 본문 끝의 인용 매체 — `parseRoundupItems`가 `"문단 (신문)"`으로 남긴 괄호를 되읽는다(원문 표기 그대로).
 * 저장된 항목 행을 재처리할 때도 이 함수가 본문에서 귀속을 되찾는다. 괄호가 없으면 `null`.
 */
export function citedOutlet(text) {
  // 스카이가 신문 이름 안에 언어 표기를 넣은 항목("(Marca (Spanish))")은 괄호가 겹친다 — 바깥 괄호를 받고 안쪽 언어 표기를 뗀다
  const m = /\(((?:[^()]|\([^()]*\)){2,80})\)\s*$/u.exec(String(text).trim());
  const outlet = m?.[1].replace(/\s*\([^()]*\)\s*$/u, "").trim();
  return outlet ? outlet : null;
}

/** 한 문단이 항목이 되기 위한 최소 길이 — 사진 설명·관련 기사 링크 제목을 거른다 */
const MIN_ITEM_CHARS = 40;
/** 칼럼 하나에서 받는 항목 상한 — 페이지 구조가 바뀌어 문단이 통째로 잡혀도 행이 폭증하지 않게 */
const MAX_ITEMS = 40;

const flat = (s) => String(s).replace(/\s+/gu, " ").trim();

/**
 * BBC: "… Dani Olmo, 28. (Sport - in Spanish), external" · "… (Marca - in Spanish, external)"
 * 괄호 안의 첫 조각이 신문 이름이다("Sport - in Spanish" → "Sport", "Telegraph - subscription required" → "Telegraph").
 */
const BBC_TAIL = /^(.*[^\s(])\s*\(([^()]{2,80})\)(?:,\s*external)?\s*$/u;

function bbcItem(text) {
  const m = BBC_TAIL.exec(text);
  if (!m) return null;
  const outlet = m[2].replace(/,\s*external$/u, "").split(/\s+-\s+/u)[0].trim();
  if (!outlet || /^external$/iu.test(outlet)) return null;
  return { text: m[1].trim(), outlet };
}

/**
 * 스카이: `<p>… - <em>Daily Mirror</em></p>` — 문단 끝의 기울임이 신문 이름이다.
 * 언어 표기가 뒤따르는 형태(`- <em>Sport </em>(Spanish).`)도 있다.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function skyItem($, p) {
  // 기울임 안에 언어 표기가 든 것("Marca (Spanish)")은 신문 이름만 남긴다 — 그대로 두면 항목 끝의 괄호가 겹친다
  const outlet = flat($(p).children("em").last().text()).replace(/\s*\([^()]*\)\s*$/u, "").trim();
  if (!outlet) return null;
  const m = new RegExp(`^(.*\\S)\\s*[-–—]\\s*${escapeRe(outlet)}\\s*(?:\\([^()]{1,30}\\))?\\s*\\.?$`, "u").exec(flat($(p).text()));
  return m ? { text: m[1].trim(), outlet } : null;
}

/** JSON-LD의 `articleBody`들 — 스카이는 여기에 HTML째로 넣는다 */
function ldBodies($) {
  const bodies = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === "object") {
          if (typeof v.articleBody === "string") bodies.push(v.articleBody);
          Object.values(v).forEach(walk);
        }
      };
      walk(JSON.parse($(el).text()));
    } catch {
      // 깨진 JSON-LD는 건너뛴다
    }
  });
  return bodies;
}

/**
 * 칼럼 HTML → 항목들(`"문단 (신문)"`). 순수 함수라 테스트가 네트워크 없이 돈다.
 * 출처 신문 표기로 끝나는 문단만 항목이다 — 칼럼 머리말·관련 기사 링크·광고 문구는 그 표기가 없다.
 */
export function parseRoundupItems(html) {
  const $ = cheerio.load(html);
  const found = [];
  // 스카이 — articleBody 안의 HTML 문단
  for (const body of ldBodies($)) {
    if (!/<p[\s>]/iu.test(body)) continue;
    const $$ = cheerio.load(body);
    $$("p").each((_, p) => {
      const it = skyItem($$, p);
      if (it) found.push(it);
    });
  }
  // BBC — 기사 영역의 문단
  if (!found.length) {
    $("article p").each((_, p) => {
      const it = bbcItem(flat($(p).text()));
      if (it) found.push(it);
    });
  }
  const seen = new Set();
  const items = [];
  for (const { text, outlet } of found) {
    if ([...text].length < MIN_ITEM_CHARS) continue;
    const line = `${text} (${outlet})`;
    if (seen.has(line)) continue;
    seen.add(line);
    items.push(line);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}
