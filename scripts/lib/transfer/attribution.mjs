/**
 * 항목 단위 귀속 판정 + 여러 소스에 걸친 묶음 키.
 */
import { createHash } from "node:crypto";

/**
 * 이 항목의 저자를 어디까지 믿을 수 있는가.
 *
 * ⚠ **소스 단위로 신뢰를 주면 안 된다**는 것이 실측으로 드러났다. 비공식 오른스테인 미러는
 *   그의 속보(🚨/EXCL/BREAKING)를 100% 충실히 전달하지만, 물량의 68%는 저자 표기가 전혀 없는
 *   The Athletic 기사체 콘텐츠다. 그 68%를 "오른스테인이 말했다"로 적으면 없는 사실을 만든다.
 *
 * @returns `{ attribution, attributedTo, tier }` 또는 **`null`(저자 확증 불가 — 저장하지 않는다)**.
 *   크롤러는 이 경우를 `unattributed`로 저장했는데, 온더볼은 그 값을 enum에 두지 않았다
 *   (사유는 마이그레이션 20260924000001 머리말).
 */
export function resolveAttribution(def, item) {
  switch (def.kind) {
    case "bluesky":
      // 레지스트리에 인증 발급자가 기록돼 있으면 본인 계정 직접 게시로 본다
      if (!def.verification || !item.authorHandle) return null;
      return {
        attribution: def.defaultAttribution === "outlet" ? "outlet" : "verified_author",
        attributedTo: item.authorHandle,
        tier: def.tier,
      };

    case "telegram": {
      const cfg = def.config;
      // (a) 원본 퍼머링크가 있으면 출처를 역추적할 수 있다 — 로마노 채널이 이 경우다
      if (item.provenanceUrl && item.authorHandle) {
        return { attribution: "linked_mirror", attributedTo: item.authorHandle, tier: def.tier };
      }
      // (b) 비공식 미러라도 원저자 서명 패턴이면 귀속을 승격한다
      if (!cfg.official && cfg.mirrorsAuthor && cfg.attributionSignature?.test(item.text)) {
        return { attribution: "linked_mirror", attributedTo: cfg.mirrorsAuthor, tier: 1 };
      }
      // 공식 채널인데 링크가 없는 메시지 — 채널 자체는 믿을 수 있으므로 채널에 귀속
      if (cfg.official) {
        return { attribution: "linked_mirror", attributedTo: cfg.channel, tier: def.tier };
      }
      return null;
    }

    case "rss":
      return { attribution: "outlet", attributedTo: item.authorHandle, tier: def.tier };

    default:
      return null;
  }
}

/**
 * 여러 소스에 걸친 중복 묶음 키.
 *
 * 같은 뉴스가 Bluesky·텔레그램·매체 RSS로 3~10번 들어온다. `(source_id, external_id)` 유니크는
 * "같은 소스의 같은 글"만 막으므로, 소스를 가로지르는 묶음은 내용으로 판정한다.
 * 완벽한 클러스터링을 목표로 하지 않는다 — 잘못 묶이면 펼쳐 보면 되고, 안 묶이면 중복이 보일 뿐이다.
 */
export function clusterKey(players, clubs, text) {
  const p = players.map(normalize).filter(Boolean).sort();
  const c = clubs.map(normalize).filter(Boolean).sort();

  // 선수가 잡혔으면 선수 + 구단으로 묶는다(가장 신뢰도 높은 조합)
  if (p.length) return hash(["p", ...p, ...c].join("|"));

  // ⚠ 선수 없이 구단 하나로 묶으면 그 구단의 모든 뉴스가 한 덩어리가 된다 → 2개 이상일 때만
  if (c.length >= 2) return hash(["c", ...c, ...significantWords(text)].join("|"));

  return null;
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // 발음 구별 기호 제거 (Leão → leao)
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "for", "from", "with", "of", "in", "on", "at", "is", "are", "was", "were",
  "has", "have", "had", "will", "be", "been", "that", "this", "by", "as", "it", "its", "their", "his", "her",
  "deal", "move", "transfer", "club", "player", "new", "signing", "sign", "agreement", "talks", "offer", "bid",
]);

/** 본문에서 의미 있는 단어 몇 개 — 구단만으로는 부족할 때의 보조 신호 */
function significantWords(text, n = 4) {
  return [...new Set(normalize(text).split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))].sort().slice(0, n);
}

function hash(s) {
  // ⚠ 16자리 소문자 hex — `transfer_news.cluster_key`의 CHECK와 한 쌍이다
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}
