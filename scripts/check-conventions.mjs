#!/usr/bin/env node
/**
 * 규약 문서의 "목록"이 조용히 썩는 것을 막는 검사.
 *
 * 원칙(FSD 단방향·배럴 공개 API·알약/그림자 예외)은 사람이 읽고 지키지만,
 * **목록**은 코드가 움직이면 자동으로 틀려진다. 실제로 세 번 되돌아 고쳤고
 * 그중 한 번은 보안 표면 목록이 3건 거짓이었다.
 *
 * 그래서 `supabase/tests/run-rls.sh`가 DB에 대해 하는 일을 프론트 규약에 대해 한다 —
 * **양방향으로** 본다. ① 목록에 없는 새 위반 ② 목록에는 있는데 실제로는 사라진 항목.
 * ②를 안 보면 검사가 죽은 채로 로그만 깨끗해진다.
 *
 * 판정은 이 파일이 **단독으로 소유**한다(`parsePostId`·`lengthOverflow`와 같은 이유).
 * 규약 문서의 표는 설명이고, 진짜 목록은 아래 상수들이다.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const p = (...xs) => join(ROOT, ...xs);
const rel = (abs) => relative(ROOT, abs).split(sep).join("/");

// ─────────────────────────────────────────────────────────────
// 목록 (= 규약 문서의 표가 설명하는 그 목록. 여기가 단일 소스다)
// ─────────────────────────────────────────────────────────────

/** 배럴을 거치지 않아도 되는 경로. 서버 소비자(또는 서버 렌더 여지를 남기는 모듈)의 탈출구다. */
const DEEP_IMPORT_ALLOWED = new Set([
  "@/shared/api/supabase-server",
  // 익명 서버 클라이언트 — Data Cache가 서버 전용이라 supabase-server와 같은 취급이다
  "@/shared/api/supabase-anon",
  "@/shared/lib/cn",
  "@/shared/lib/format",
  "@/shared/lib/post-id",
  "@/shared/lib/text",
  // 쿼리 키 조각 — `api/keys.ts`는 서버 소비자라 "use client"를 담은 배럴을 거칠 수 없다
  "@/shared/lib/query-scope",
  "@/entities/post/api/list-query",
  "@/entities/survey/api/list-query",
  "@/entities/comment/api/list-query",
  "@/entities/match/api/list-query",
  // 마감 판정의 단일 소스. `"use client"`가 없어 서버 안전하고, SSR 페이지가 클라이언트와
  // **같은 판정**을 써야 한다(`lib/plain-summary`와 같은 형태).
  "@/entities/match/lib/open",
  "@/entities/post/lib/plain-summary",
  "@/entities/post/lib/hot",
  "@/entities/session/lib/auth-error-message",
  "@/features/sign-in/lib/pkce-verifier",
]);
/** `@/entities/<slice>/...` 형태로 모든 엔티티에 공통 허용되는 서버 안전 경로 */
const DEEP_IMPORT_ALLOWED_ENTITY_SUFFIX = ["model/types", "api/mappers", "api/keys"];


/**
 * 배럴이 공개하지만 **아직 호출부가 없는** export. "잊고 안 지운 것"과 구분하기 위해
 * 하나하나 사유를 적는다. ⚠ 양방향으로 검사한다 — 여기 없는데 미사용이면 실패,
 * 여기 있는데 현역이 돼도 실패한다(그래야 목록이 죽지 않는다).
 */
const DOCUMENTED_UNUSED = new Map([
  // reuse.md `@/shared/ui`의 "현재 미사용" 목록. 실측상 번들에 실리지 않는다
  // (아래 목록 전량이 프로덕션 청크에서 0건) — 다만 그건 각 모듈이
  // 순수해서이지 "배럴이라 공짜"여서가 아니다. 근거는 architecture.md의 트리셰이킹 절.
  ["TabHeader", "v1 자산 (reuse.md 미사용 목록)"],
  ["Flag", "v1 자산 (reuse.md 미사용 목록)"],
  ["Shirt", "v1 자산 (reuse.md 미사용 목록)"],
  ["SectionHead", "v1 자산 (reuse.md 미사용 목록)"],
  ["LiveDot", "v1 자산 (reuse.md 미사용 목록)"],
  ["LiveStatusPill", "v1 자산 (reuse.md 미사용 목록)"],
  ["NightCard", "v1 자산 (reuse.md 미사용 목록)"],
  ["PlayerSilhouette", "v1 자산 (reuse.md 미사용 목록)"],
  // 위 컴포넌트들의 prop 타입 — 컴포넌트와 운명을 같이한다
  ["FlagCode", "Flag의 prop 타입"],
  ["ShirtStripe", "Shirt의 prop 타입"],
  ["RatioSegment", "RatioBar의 prop 타입"],
  // reuse.md가 공개 API로 문서화한 것들
  ["PostInsert", "reuse.md '이미 뽑아 둔 것' — DB 행 타입"],
  ["PostUpdate", "reuse.md '이미 뽑아 둔 것' — DB 행 타입"],
  ["CommentInsert", "reuse.md '이미 뽑아 둔 것' — DB 행 타입"],
  ["HOT_LIKE_THRESHOLD", "reuse.md가 HOT 판정 임계값으로 공개"],
  ["HOT_WINDOW_MS", "reuse.md가 HOT 판정 창으로 공개"],
  ["graphemeLength", "reuse.md가 공개 — 단 한도 판정은 lengthOverflow가 소유한다"],
  ["PostDraft", "PostForm의 입력 타입 — validatePost와 한 쌍"],
]);

/** styling.md가 못박은 예외 위치. 여기 없는 파일에 나타나면 실패한다. */
const STYLE_ALLOWED = {
  "rounded-full": [
    // 알약 예외 — 아래 목록이 전부다
    "src/shared/ui/action-chip-class.ts",
    "src/views/post-detail/ui/comment-bar.tsx",
    "src/views/post-list/ui/post-list-view.tsx",
    // "대상이 아닌 것" — 원형 히트 영역
    "src/widgets/sub-header/ui/sub-header.tsx",
    "src/views/post-detail/ui/post-detail-view.tsx",
    "src/views/profile/ui/profile-view.tsx",
    // "대상이 아닌 것" — 원형 아이콘 컨테이너
    "src/shared/ui/empty-state.tsx",
    // "대상이 아닌 것" — 표시 요소
    "src/shared/ui/live-dot.tsx",
    "src/shared/ui/avatar.tsx",
    "src/shared/ui/pill.tsx",
    "src/shared/ui/ratio-bar.tsx",
    "src/shared/ui/wordmark.tsx",
    "src/entities/post/ui/post-card.tsx",
    // "대상이 아닌 것" — 바텀시트 그래버(드래그 어포던스, 클릭 대상이 아니다)
    "src/shared/ui/sheet.tsx",
    // "대상이 아닌 것" — 분할 카드의 VS 배지(aria-hidden 장식, 컨트롤이 아니다)
    "src/entities/survey/ui/vs-badge.tsx",
    // 등번호 원·센터서클·사건 배지 — 컨트롤이 아니라 피치와 선수를 그리는 표시 요소다
    // (전부 원이 아니면 성립하지 않는 형태다)
    "src/entities/match/ui/lineup-pitch.tsx",
    "src/entities/match/ui/player-badges.tsx",
    "src/entities/match/ui/player-photo.tsx",
  ],
  // 그림자는 "떠 있는 레이어"만 — resting 카드·목록·헤더는 flat + 1px 헤어라인
  "shadow-": [
    "src/shared/ui/sheet.tsx",
    "src/shared/ui/dialog.tsx",
    "src/features/write-post/ui/link-insert-dialog.tsx",
    "src/views/post-list/ui/post-list-view.tsx",
    "src/widgets/bottom-tab-bar/ui/bottom-tab-bar.tsx",
  ],
  "backdrop-blur": ["src/widgets/bottom-tab-bar/ui/bottom-tab-bar.tsx"],
  // 에메랄드가 나타나는 자리 — styling.md의 표와 한 쌍이다.
  // ⚠ 원칙("눌러야 할 곳 하나")으로는 경계가 갈리지 않아(활성 탭 아이콘 ↔ 활성 말머리 칩은
  //   둘 다 aria-current인 Link다) 자리를 센다. 새 에메랄드는 여기와 표에 함께 적는다.
  "bg-primary": [
    "src/shared/ui/button-class.ts", // primary 버튼 — 그 화면의 CTA
    "src/shared/ui/dialog.tsx", // confirmTone="primary"
    "src/shared/ui/action-chip-class.ts", // 좋아요 활성(상세)
    "src/shared/ui/wordmark.tsx", // 워드마크의 볼 — 브랜드 마크
    "src/shared/ui/pill.tsx", // green 배지
    "src/shared/ui/live-dot.tsx", // primary 도트
    "src/entities/survey/ui/vs-badge.tsx", // 분할 카드의 VS 배지
    // 승부예측의 결과 띠 — 채점 뒤 결과 칸에만 1개(선택지 3개에는 쓰지 않는다)
    "src/entities/match/ui/prediction-block.tsx",
  ],
  /*
   * ⚠ **에메랄드는 리터럴로만 오지 않는다.** `Pill variant="green"`은 `bg-primary`를
   *   간접으로 쓰므로 위 리터럴 대조를 **구조적으로 통과할 수 없다** — 실제로 그 경로로
   *   목록 카드에 에메랄드가 카드 수만큼 들어왔는데 검사도 표도 알지 못했다.
   *   `Pill`은 v1 자산에만 쓰이던 정의라 아무도 그 자리를 세지 않고 있었다.
   */
  /*
   * ⚠ **동적 variant는 검사가 볼 수 없다.** `variant={ok ? "green" : "crimson"}`은 리터럴
   *   대조를 그대로 통과한다(실측 — 주입 테스트에서 잡히지 않았다). 그래서 `Pill`의
   *   variant는 **리터럴이어야 한다**는 규칙 자체를 검사로 만든다(허용 목록이 비어 있다).
   *   `Button variant={…}`는 에메랄드와 무관해 대상이 아니다.
   */
  "Pill variant={": [],
  // 에메랄드 확인 버튼 — `bg-primary` 리터럴이 아니라 위 대조에 걸리지 않던 자리
  'confirmTone="primary"': ["src/shared/ui/sign-in-dialog.tsx"],
  'variant="green"': [
    "src/shared/ui/live-status-pill.tsx", // v1 자산(미사용)
    "src/entities/match/ui/match-card.tsx", // 예측 적중 배지 — 예측했고 채점된 카드에만 1개
    "src/views/match-detail/ui/match-detail-view.tsx", // 상세의 적중 배지 — 한 화면에 1개
  ],
  "text-primary": [
    "src/entities/post/ui/post-card.tsx", // 목록 카드의 좋아요 하트
    "src/entities/comment/ui/comment-item.tsx", // "내 댓글" 배지
    "src/views/post-detail/ui/comment-section.tsx", // 댓글 수
    "src/widgets/bottom-tab-bar/ui/bottom-tab-bar.tsx", // 활성 탭 아이콘
  ],
};

/** FSD 레이어 서열. 하위는 상위를 import할 수 없다. */
const LAYER_RANK = { shared: 0, entities: 1, features: 2, widgets: 3, views: 4, app: 5 };
/** 슬라이스 개념이 없는 레이어(세그먼트 간 참조가 정상) */
const NO_SLICE_LAYERS = new Set(["shared", "app"]);

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(abs);
  }
  return out;
}

/**
 * 주석만 걷어내고 문자열은 그대로 남긴다.
 * ⚠ 순진하게 `//`를 자르면 `https://`가 잘린다 — 따옴표·템플릿 상태를 따라가야 한다.
 * (문자열을 남기는 이유: className 검사가 문자열 안을 봐야 한다)
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // ' " `
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `import ... from "X"` / `export ... from "X"` 의 X 목록 */
function importSpecifiers(code) {
  const specs = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) specs.push(m[1]);
  // `import "x"` 부수효과 import
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(code))) specs.push(m[1]);
  return specs;
}

/**
 * `import { a, b as c } from "X"` 를 [{name, from}]으로. **이름이 아니라 바인딩을 본다.**
 * ⚠ 단어 매칭으로 사용 여부를 세면 안 된다 — `lucide-react`의 `Flag`가
 *   `shared/ui`의 `Flag`를 살아 있는 것처럼 보이게 만든다(실측).
 */
function namedImports(code) {
  const out = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) {
    for (const rawName of m[1].split(",")) {
      const piece = rawName.replace(/\btype\b/g, "").trim();
      if (!piece) continue;
      out.push({ name: piece.split(" as ")[0].trim(), from: m[2] });
    }
  }
  return out;
}

/** import specifier → 확장자 없는 절대 모듈 경로. 외부 패키지는 null. */
function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith("@/")) return p("src", spec.slice(2));
  if (spec.startsWith(".")) return join(fromFile, "..", spec);
  return null;
}

/** 배럴의 `export { a, b as c, type D } from "./src"` 를 [{name, from}] 으로 */
function barrelExports(code) {
  const out = [];
  const re = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) {
    for (const raw of m[1].split(",")) {
      const piece = raw.replace(/\btype\b/g, "").trim();
      if (!piece) continue;
      const name = piece.includes(" as ") ? piece.split(" as ").pop().trim() : piece;
      if (name) out.push({ name, from: m[2] });
    }
  }
  return out;
}

const findings = [];
const fail = (rule, message) => findings.push({ rule, message });

// ─────────────────────────────────────────────────────────────
// 파일 수집
// ─────────────────────────────────────────────────────────────

const files = [...walk(p("src")), ...walk(p("app"))];
if (existsSync(p("proxy.ts"))) files.push(p("proxy.ts"));

const code = new Map(); // abs -> 주석 제거된 소스
const raw = new Map(); // abs -> 원본
for (const f of files) {
  const text = readFileSync(f, "utf8");
  raw.set(f, text);
  code.set(f, stripComments(text));
}

// ─────────────────────────────────────────────────────────────
// 1. 배럴 export 중 아무도 쓰지 않는 것 (화이트리스트 없이 전수 판정)
//    reuse.md가 세 번 틀린 바로 그 항목이다.
// ─────────────────────────────────────────────────────────────

// (모듈 경로, 이름) → 그 바인딩을 import하는 파일이 있는가
const importedFrom = new Map(); // 모듈 절대경로 → Set<name>
for (const f of files) {
  for (const { name, from } of namedImports(code.get(f))) {
    const mod = resolveSpecifier(from, f);
    if (!mod) continue;
    if (!importedFrom.has(mod)) importedFrom.set(mod, new Set());
    importedFrom.get(mod).add(name);
  }
}
const isImported = (mod, name) => importedFrom.get(mod)?.has(name) ?? false;

const barrels = files.filter((f) => /\/index\.ts$/.test(rel(f)) && rel(f).startsWith("src/"));
const exportedNames = new Set();

for (const barrel of barrels) {
  const dir = barrel.slice(0, -"/index.ts".length);
  for (const { name, from } of barrelExports(code.get(barrel))) {
    exportedNames.add(name);
    // 배럴을 통해 쓰거나(`@/entities/post`) 소스 모듈을 직접 쓰거나(deep·상대경로) 둘 중 하나면 현역이다
    const used = isImported(dir, name) || isImported(join(dir, from.replace(/^\.\//, "")), name);
    const documented = DOCUMENTED_UNUSED.get(name);

    if (used && documented) {
      fail(
        "barrel-list-stale",
        `\`${name}\`는 미사용으로 등재돼 있는데 실제로는 쓰이고 있다 — DOCUMENTED_UNUSED와 reuse.md를 함께 고친다 (${rel(barrel)})`,
      );
    } else if (!used && !documented) {
      fail(
        "barrel-unused-export",
        `\`${name}\`를 배럴이 공개하는데 호출부가 0이다 — 지우거나, 남길 이유를 DOCUMENTED_UNUSED에 적는다 (${rel(barrel)})`,
      );
    }
  }
}
for (const name of DOCUMENTED_UNUSED.keys()) {
  if (!exportedNames.has(name))
    fail("barrel-list-stale", `\`${name}\`가 미사용 목록에 있는데 배럴에서 사라졌다 — 목록을 정리한다`);
}

// ─────────────────────────────────────────────────────────────
// 2·3. 레이어 단방향 + 동일 레이어 간 import
// ─────────────────────────────────────────────────────────────

for (const f of files) {
  const r = rel(f);
  const parts = r.split("/");
  if (parts[0] !== "src") continue;
  const layer = parts[1];
  if (!(layer in LAYER_RANK)) continue;
  const slice = parts[2];

  for (const spec of importSpecifiers(code.get(f))) {
    const m = /^@\/([^/]+)(?:\/([^/]+))?/.exec(spec);
    if (!m) continue;
    const [, targetLayer, targetSlice] = m;
    if (!(targetLayer in LAYER_RANK)) continue;

    if (LAYER_RANK[targetLayer] > LAYER_RANK[layer]) {
      fail("layer-direction", `${r} → ${spec} (하위 레이어가 상위를 import한다)`);
    } else if (
      targetLayer === layer &&
      !NO_SLICE_LAYERS.has(layer) &&
      targetSlice &&
      targetSlice !== slice
    ) {
      fail("same-layer-import", `${r} → ${spec} (동일 레이어의 다른 슬라이스)`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 4. deep import 화이트리스트 + 클라이언트 파일의 deep import 금지
// ─────────────────────────────────────────────────────────────

for (const f of files) {
  const r = rel(f);
  const isClient = /^\s*["']use client["']/.test(raw.get(f));
  for (const spec of importSpecifiers(code.get(f))) {
    if (spec.endsWith(".css")) continue;
    const parts = spec.split("/");
    if (parts[0] !== "@") continue;
    const layer = parts[1];
    if (!(layer in LAYER_RANK)) continue; // @/types 등은 레이어가 아니다
    if (layer === "app") continue; // FSD app 레이어는 슬라이스가 아니라 배럴을 두지 않는다
    // 배럴 경로 깊이: shared/app은 `@/<layer>/<seg>`, 나머지는 `@/<layer>/<slice>`
    if (parts.length <= 3) continue;

    const suffix = parts.slice(3).join("/");
    const allowed =
      DEEP_IMPORT_ALLOWED.has(spec) ||
      (layer === "entities" && DEEP_IMPORT_ALLOWED_ENTITY_SUFFIX.includes(suffix));

    if (!allowed) {
      fail("deep-import", `${r} → ${spec} (배럴을 거치거나 화이트리스트에 등재한다)`);
    } else if (isClient) {
      fail(
        "deep-import-client",
        `${r} → ${spec} (deep import는 **서버 소비자**의 탈출구다. "use client" 파일은 배럴을 쓴다)`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 금지 API
// ─────────────────────────────────────────────────────────────

for (const f of files) {
  const r = rel(f);
  const c = code.get(f);
  if (/\buseSearchParams\b/.test(c))
    fail("banned-api", `${r}: useSearchParams — 프리렌더가 CSR로 떨어진다. useNextParam을 쓴다`);
  if (/\)\s*:\s*CSSProperties/.test(c))
    fail("banned-api", `${r}: CSSProperties를 반환하는 헬퍼 — className 문자열을 반환한다`);
  if (r.startsWith("src/") && /^\s*export\s+default\b/m.test(c))
    fail("banned-api", `${r}: src/ 안에서는 named export만 쓴다`);
  if (/\bprose(-\w+)?\b/.test(c))
    fail("banned-api", `${r}: Tailwind Typography(prose)는 도입하지 않는다 — Markdown의 components 맵을 쓴다`);
  // 연산자 `void`(값 버리기)만 잡는다 — 타입 자리의 void(`() => void`·`Promise<void>`)는
  // 뒤에 `;`·`>`·`,`·`)`가 오므로 이 패턴에 걸리지 않는다.
  if (/\bvoid\s+[A-Za-z_$(]/.test(c))
    fail("banned-api", `${r}: 연산자 \`void\` — 붙여도 실패를 잡아주지 않는다(code-quality.md)`);
}

if (files.some((f) => /^app\/.*\/route\.tsx?$/.test(rel(f))))
  fail("banned-api", "app/**/route.ts — Route Handler를 두지 않는다(클라이언트가 supabase를 직접 호출한다)");
if (existsSync(p("src/pages")))
  fail("banned-api", "src/pages — Next Pages Router로 오감지된다. src/views를 쓴다");

// ─────────────────────────────────────────────────────────────
// 6. 스타일 예외 화이트리스트 (양방향)
// ─────────────────────────────────────────────────────────────

for (const [needle, allowed] of Object.entries(STYLE_ALLOWED)) {
  const seen = new Set();
  for (const f of files) {
    if (!code.get(f).includes(needle)) continue;
    const r = rel(f);
    seen.add(r);
    if (!allowed.includes(r))
      fail("style-exception", `${r}: \`${needle}\` — styling.md의 예외 목록에 없다`);
  }
  for (const r of allowed) {
    if (!seen.has(r))
      fail("style-exception", `${r}: \`${needle}\`가 사라졌다 — 예외 목록에서 뺀다(목록이 실물과 갈렸다)`);
  }
}

// ─────────────────────────────────────────────────────────────
// 7. 규약 문서가 가리키는 경로가 실재하는가 (양방향)
//    AGENTS.md "사라진 심볼·파일을 규칙의 주어로 삼지 않는다"를 기계가 대조한다 —
//    독자가 열어볼 수 없는 이름에 규칙이 묶이면 규칙째 죽는다.
//    ⚠ walk()는 .ts|.tsx만 모으므로(위 "파일 수집") 마크다운은 여기서 직접 읽는다.
// ─────────────────────────────────────────────────────────────

const DOC_FILES = [
  "AGENTS.md",
  ...readdirSync(p("docs/conventions"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/conventions/${f}`),
];

/** 백틱 토큰 중 **경로꼴**만 판정한다. 라우트 문자열·Tailwind 유틸·SQL 식별자는 대상이 아니다. */
const DOC_PATH_PREFIX = /^(@\/|src\/|app\/|supabase\/|scripts\/|docs\/|\.claude\/)/;
const DOC_PATH_EXT = /\.(ts|tsx|md|sql|sh|css|json)$/;
/**
 * 판정 대상에서 빼는 것 — 애초에 실물을 가리키지 않는 표기다.
 * 글로브(별표를 낀 경로) · 마이그레이션 파일명 템플릿(YYYY…) · 명령문(공백 포함) · 외부 패키지.
 */
const DOC_PATH_SKIP = /[*?\s]|YYYY|^node_modules\//;

/** 문서가 예시로만 쓰는 가상 경로. 실물이 없어도 되는 사유를 적는다(양방향 검사). */
const DOC_PATH_EXEMPT = new Map([]);

/** 저장소 전체 파일 목록 — 문서의 생략형을 접미사로 맞추기 위해 필요하다. */
function walkAll(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkAll(abs, out);
    else out.push(rel(abs));
  }
  return out;
}
const allPaths = walkAll(ROOT);

/**
 * 문서가 쓰는 표기 변형을 전부 흡수한다:
 * `@/` 별칭 · `src/` 생략(`shared/ui/sheet.tsx`) · 파일명만(`post-card.tsx`) ·
 * 문서끼리 상대 참조(`styling.md`) · `supabase/tests/` 생략(`rls.sql`) · 디렉터리 → `index.ts`.
 * ⚠ 접미사로 맞추되 **경계(`/`)를 지킨다** — 그래야 `src/없는/경로/post-card.tsx`가 통과하지 않는다.
 */
function docPathResolves(token) {
  const t = (token.startsWith("@/") ? `src/${token.slice(2)}` : token).replace(/\/$/, "");
  for (const cand of [t, `${t}.ts`, `${t}.tsx`, `${t}/index.ts`]) {
    if (existsSync(p(cand))) return true;
    if (allPaths.some((f) => f === cand || f.endsWith(`/${cand}`))) return true;
  }
  return false;
}

const docExemptSeen = new Set();
for (const doc of DOC_FILES) {
  readFileSync(p(doc), "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(/`([^`\n]+)`/g)) {
        const token = m[1];
        if (!DOC_PATH_PREFIX.test(token) && !DOC_PATH_EXT.test(token)) continue;
        if (DOC_PATH_SKIP.test(token)) continue;
        if (DOC_PATH_EXEMPT.has(token)) {
          docExemptSeen.add(token);
          continue;
        }
        if (!docPathResolves(token))
          fail(
            "doc-dead-path",
            `${doc}:${i + 1} \`${token}\` — 규약 문서가 없는 경로를 가리킨다(고치거나 DOC_PATH_EXEMPT에 사유를 적는다)`,
          );
      }
    });
}
for (const token of DOC_PATH_EXEMPT.keys()) {
  if (!docExemptSeen.has(token))
    fail("doc-dead-path", `\`${token}\`가 DOC_PATH_EXEMPT에 있는데 문서에서 사라졌다 — 목록을 정리한다`);
}

// ─────────────────────────────────────────────────────────────
// 결과
// ─────────────────────────────────────────────────────────────

if (findings.length === 0) {
  console.log(`✅ 규약 검사 통과 (${files.length}개 파일)`);
  process.exit(0);
}

const byRule = new Map();
for (const { rule, message } of findings) {
  if (!byRule.has(rule)) byRule.set(rule, []);
  byRule.get(rule).push(message);
}
console.error(`❌ 규약 위반 ${findings.length}건\n`);
for (const [rule, messages] of byRule) {
  console.error(`[${rule}] ${messages.length}건`);
  for (const m of messages) console.error(`  · ${m}`);
  console.error("");
}
process.exit(1);
