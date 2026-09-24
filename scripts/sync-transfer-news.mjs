/**
 * 이적 소식을 `transfer_news`에 동기화한다. 소스는 Bluesky · 텔레그램 · 매체 RSS다
 * (목록과 선정 근거는 `scripts/lib/transfer/registry.mjs`).
 *
 *   node scripts/sync-transfer-news.mjs                     # 켜진 소스 전부
 *   node scripts/sync-transfer-news.mjs --only tg:romano,bsky:ornstein
 *   node scripts/sync-transfer-news.mjs --dry-run           # 수집·추출만 하고 쓰지 않는다
 *   node scripts/sync-transfer-news.mjs --reprocess         # 재수집 없이 저장분을 다시 추출한다
 *   node scripts/sync-transfer-news.mjs --verify            # 계정 인증·채널 출처를 점검한다
 *   node scripts/sync-transfer-news.mjs --remote            # 원격 프로젝트에 쓴다 (명시적일 때만)
 *
 * ⚠ **정기 실행 주기는 `maxRunIntervalMinutes()`(registry.mjs) 이하여야 한다.** 그보다 느리면
 *   보관시간이 짧은 피드에서 항목이 밀려나 유실된다. 이 스크립트는 자기 실행 주기를 알 수 없어
 *   검사하지 못한다 — 스케줄을 정하는 쪽이 지킨다. `--verify`가 그 값을 출력한다.
 *   스케줄은 `.github/workflows/sync-transfer-news.yml`(매시, `--remote`)이다.
 *   한 번 돌 때 켜진 소스를 전부 돈다 — 소스별 주기는 없다(사유는 registry.mjs 머리말).
 *
 * ⚠ **소스 하나라도 실패하면 종료 코드가 1이다.** 읽는 화면이 없어 종료 코드가 유일한 신호다
 *   (크론 핸들러가 부분 실패를 500으로 내는 것과 같은 이유 — `nextjs.md`).
 *
 * 원래 별도 프로젝트(transfer-market-crawler)였다. 추출 규칙의 회귀 테스트는
 * `scripts/test-transfer-extract.mjs`가 갖는다.
 */
import { clampCp, createSyncClient, flag, guardTarget, loadEnv } from "./lib/sync-db.mjs";
import { reprocessAll, syncSources } from "./lib/transfer/pipeline.mjs";
import { SOURCES, enabledSources, findSource, maxRunIntervalMinutes } from "./lib/transfer/registry.mjs";
import { inspectTelegramChannel, verifyBlueskyAccount } from "./lib/transfer/sources.mjs";

const argv = process.argv.slice(2);
const allowRemote = argv.includes("--remote");
const dryRun = argv.includes("--dry-run");
const reprocess = argv.includes("--reprocess");
const onlyArg = flag(argv, "only");

/*
 * ⚠ **모르는 플래그와 뜻이 겹치는 조합은 거부한다.** 조용히 무시하면 의도와 다른 일이 원격에 일어난다
 *   — 값 없는 `--only`(예: `--only --remote`)가 null이 되어 **켜진 소스 전부**를 돌렸고,
 *   `--reprocess --dry-run`은 재처리가 아니라 수집 드라이런을 돌렸다(QA).
 */
const KNOWN = new Set(["--remote", "--dry-run", "--reprocess", "--verify", "--only"]);
const unknownFlags = argv.filter((a, i) => a.startsWith("--") ? !KNOWN.has(a) : argv[i - 1] !== "--only");
if (unknownFlags.length) usage(`알 수 없는 인자: ${unknownFlags.join(" ")}`);
if (argv.includes("--only") && !onlyArg) usage("--only 뒤에 소스 id가 필요합니다");
if ([dryRun, reprocess, argv.includes("--verify")].filter(Boolean).length > 1) {
  usage("--dry-run · --reprocess · --verify 는 함께 쓸 수 없습니다");
}
if (reprocess && onlyArg) usage("--reprocess 는 저장분 전체를 다시 추출합니다 — --only 와 함께 쓸 수 없습니다");

function usage(message) {
  console.error(message);
  process.exit(1);
}

// ── 점검 모드 — DB를 쓰지 않는다 ────────────────────────────────────────
if (argv.includes("--verify")) {
  await verify();
  process.exit(process.exitCode ?? 0);
}

// ── 대상 소스 ──────────────────────────────────────────────────────────
let targets = enabledSources();
if (onlyArg) {
  const ids = onlyArg.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !findSource(id));
  if (unknown.length) {
    console.error(`알 수 없는 소스: ${unknown.join(", ")}`);
    process.exit(1);
  }
  targets = ids.map(findSource);
}

// ── 드라이런 — 수집·추출만 ──────────────────────────────────────────────
if (dryRun) {
  const results = await syncSources(null, targets, { dryRun: true });
  printResults(results);
  for (const r of results) {
    for (const row of (r.preview ?? []).filter((x) => x.relevance >= 0.8).slice(0, 3)) {
      console.log(`  [${row.stage}] ${row.attributed_to ?? r.sourceId} ${row.fee_text ?? ""} — ${clampCp(row.body.replace(/\s+/g, " "), 90)}`);
    }
  }
  process.exit(process.exitCode ?? 0);
}

// ── DB ────────────────────────────────────────────────────────────────
const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  process.exit(1);
}
guardTarget(url, allowRemote);
const supabase = createSyncClient(url, key);

if (reprocess) {
  try {
    const s = await reprocessAll(supabase);
    console.log(`재처리: 읽음 ${s.read} · 갱신 ${s.updated} · 실패 ${s.failed}`);
    if (s.lostAttribution.length) {
      // ⚠ 실패로 알린다 — 그 행들은 옛 저자 표기를 단 채 공개돼 있다(pipeline.mjs의 reprocessAll)
      console.error(`✗ 규칙 변경으로 귀속을 잃은 행 ${s.lostAttribution.length}건 — 지우지 않고 남겼습니다. 확인 후 삭제하세요`);
      console.error(`  id: ${s.lostAttribution.join(", ")}`);
    }
    if (s.unknownSource) console.warn(`⚠ 레지스트리에 없는 소스의 행 ${s.unknownSource}건 — 건드리지 않았습니다`);
    if (s.failed || s.lostAttribution.length) process.exitCode = 1;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
  console.log(`\n대상: ${url}`);
  process.exit(process.exitCode ?? 0);
}

const t0 = Date.now();
const results = await syncSources(supabase, targets);
printResults(results);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}초 · 대상: ${url}`);
process.exit(process.exitCode ?? 0);

// ─────────────────────────────────────────────────────────────────────

function printResults(results) {
  console.log(`\n${"소스".padEnd(22)} ${"결과".padEnd(4)} ${"수집".padStart(5)} ${"대상".padStart(5)} ${"신규".padStart(5)} ${"ms".padStart(6)}  건너뜀`);
  console.log("─".repeat(80));
  for (const r of results) {
    const skipped = Object.entries(r.skipped).map(([k, v]) => `${k} ${v}`).join(" · ");
    console.log(
      `${r.sourceId.padEnd(22)} ${(r.ok ? "OK" : "실패").padEnd(4)} ${String(r.fetched).padStart(5)} ${String(r.rows).padStart(5)} ${String(r.inserted).padStart(5)} ${String(r.ms).padStart(6)}  ${skipped}`,
    );
    for (const w of r.warnings) console.log(`   ⚠ ${w}`);
    if (r.error) console.log(`   ✗ ${r.error}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length}개 소스 중 ${results.length - failed.length}개 성공 · 신규 ${results.reduce((s, r) => s + r.inserted, 0)}건`);
  if (failed.length) process.exitCode = 1;
}

/**
 * 빈도가 높다고 좋은 소스가 아니다 — 사칭 계정이나 정체불명 미러도 물량은 많다.
 * 등록된 소스가 여전히 "그 사람 본인"인지, 미러가 출처를 밝히는지 확인한다.
 */
async function verify() {
  console.log(`정기 실행 주기 상한: ${maxRunIntervalMinutes()}분 (가장 짧은 피드 보관시간 ÷ 3)\n`);
  for (const s of SOURCES.filter((x) => x.kind === "bluesky")) {
    try {
      const v = await verifyBlueskyAccount(s.config.handle);
      const ok = v.verifiedStatus === "valid";
      const drift = s.verification && v.issuerHandle && s.verification.issuerHandle !== v.issuerHandle;
      console.log(`${s.id.padEnd(20)} ${ok ? "✓ 인증" : "✗ 인증 없음"}  발급자 ${v.issuerHandle ?? "—"}  팔로워 ${v.followersCount}`);
      if (!ok || drift) {
        console.log(`   ⚠ ${drift ? `발급자가 바뀌었다(등록: ${s.verification.issuerHandle})` : "사칭·미러봇 가능성"} — tier를 낮추거나 끈다`);
        process.exitCode = 1;
      }
    } catch (e) {
      console.log(`${s.id.padEnd(20)} ✗ 조회 실패: ${e.message}`);
      process.exitCode = 1;
    }
  }
  for (const s of SOURCES.filter((x) => x.kind === "telegram")) {
    try {
      const c = await inspectTelegramChannel(s.config.channel);
      console.log(`${s.id.padEnd(20)} 퍼머링크 ${(c.permalinkRatio * 100).toFixed(0)}% · unofficial 표기 ${c.declaresUnofficial ? "예" : "아니오"}`);
      if (c.declaresUnofficial && s.config.official) {
        console.log("   ⚠ 레지스트리는 공식인데 채널은 unofficial을 표기한다");
        process.exitCode = 1;
      }
      if (s.config.official && c.permalinkRatio < 0.5) {
        console.log("   ⚠ 퍼머링크가 절반 미만인데 공식 채널로 귀속 중이다 — 근거가 약하다");
        process.exitCode = 1;
      }
    } catch (e) {
      console.log(`${s.id.padEnd(20)} ✗ 조회 실패: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
