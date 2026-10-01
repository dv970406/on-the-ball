/**
 * 이적 소식을 `transfer_news`에 동기화하고 보드(`transfer_deal`)를 파생한다. 소스는 Bluesky · 텔레그램 · 매체 RSS
 * (목록과 선정 근거는 `scripts/lib/transfer/registry.mjs`).
 *
 *   node scripts/sync-transfer-news.mjs                          # 수집 → 가십 칼럼 나누기 → 딜 파생(LLM 판정·요약 포함)
 *   node scripts/sync-transfer-news.mjs --only tg:romano,bsky:ornstein
 *   node scripts/sync-transfer-news.mjs --dry-run                # 수집·추출만 하고 쓰지 않는다
 *   node scripts/sync-transfer-news.mjs --reprocess              # 재수집 없이 저장분을 다시 추출한다(뒤에 파생도 돈다)
 *   node scripts/sync-transfer-news.mjs --derive-only            # 수집 없이 딜 파생만 돈다
 *   node scripts/sync-transfer-news.mjs --derive-only --dry-run  # 파생 결과 요약만 찍고 쓰지 않는다(LLM도 부르지 않는다)
 *   node scripts/sync-transfer-news.mjs --derive-only --rejudge  # 저장된 판정을 무시하고 전부 다시 묻는다(지시문·사전을 고친 뒤)
 *   node scripts/sync-transfer-news.mjs --derive-only --replay   # 저장된 원출력을 지금의 해석으로 다시 읽는다(API를 부르지 않는다 — 해석만 고친 뒤)
 *   node scripts/sync-transfer-news.mjs --verify                 # 계정 인증·채널 출처를 점검한다
 *   node scripts/sync-transfer-news.mjs --remote                 # 원격 프로젝트에 쓴다(명시적일 때만). 대상은 환경변수다 —
 *                                                                #   로컬에서는 `set -a; source .env.prod; set +a` 뒤에 붙인다(.env.local은 로컬 값)
 *
 * 단계: 수집 → 가십 칼럼을 항목 행으로 → 딜 파생. 파생 안에서 이름 조회(위키데이터)와 **LLM 판정·요약**(`judge.mjs` —
 * 보도 한 건에 한 번, 이동 여부·출발·행선지·한국어 요약)이 돈다. `ANTHROPIC_API_KEY`가 없으면 판정 없이 파생한다 —
 * 판정을 받지 못한 **새** 딜은 열리지 않고 이미 있는 딜은 남는다(원격 실행은 키가 없으면 실패다).
 *
 * ⚠ 정기 실행 주기는 `maxRunIntervalMinutes()`(registry.mjs) 이하여야 한다 — 그보다 느리면 보관시간이 짧은 피드에서
 *   항목이 밀려나 유실된다. 스케줄은 `.github/workflows/sync-transfer-news.yml`(매시, `--remote`)이다.
 * ⚠ 소스 하나라도 실패하거나 행 단위 저장이 실패하면 종료 코드 1이다 — 읽는 화면이 없어 종료 코드가 유일한 신호다.
 */
import { clampCp, createSyncClient, flag, guardTarget, loadEnv } from "./lib/sync-db.mjs";
import { runDerivation } from "./lib/transfer/derive-deals.mjs";
import { JUDGE_MODEL, runJudgements } from "./lib/transfer/judge.mjs";
import { expandRoundups, reprocessAll, syncSources } from "./lib/transfer/pipeline.mjs";
import { SOURCES, enabledSources, findSource, maxRunIntervalMinutes } from "./lib/transfer/registry.mjs";
import { inspectTelegramChannel, verifyBlueskyAccount } from "./lib/transfer/sources.mjs";

const argv = process.argv.slice(2);
const allowRemote = argv.includes("--remote");
const dryRun = argv.includes("--dry-run");
const reprocess = argv.includes("--reprocess");
const deriveOnly = argv.includes("--derive-only");
const rejudge = argv.includes("--rejudge");
const replay = argv.includes("--replay");
const onlyArg = flag(argv, "only");

// 모르는 플래그와 뜻이 겹치는 조합은 거부한다 — 조용히 무시하면 의도와 다른 일이 원격에 일어난다
const KNOWN = new Set(["--remote", "--dry-run", "--reprocess", "--derive-only", "--rejudge", "--replay", "--verify", "--only"]);
const unknownFlags = argv.filter((a, i) => a.startsWith("--") ? !KNOWN.has(a) : argv[i - 1] !== "--only");
if (unknownFlags.length) usage(`알 수 없는 인자: ${unknownFlags.join(" ")}`);
if (argv.includes("--only") && !onlyArg) usage("--only 뒤에 소스 id가 필요합니다");
if ([dryRun && !deriveOnly, reprocess, deriveOnly, argv.includes("--verify")].filter(Boolean).length > 1) {
  usage("--dry-run · --reprocess · --derive-only · --verify 는 함께 쓸 수 없습니다(--derive-only 와 --dry-run 만 예외)");
}
if (replay && (!deriveOnly || dryRun || rejudge)) usage("--replay 는 --derive-only 와 함께만 씁니다(--dry-run·--rejudge 와는 함께 쓸 수 없습니다)");
if (rejudge && (!deriveOnly || dryRun)) usage("--rejudge 는 --derive-only 와 함께만 씁니다(--dry-run 과는 함께 쓸 수 없습니다)");
if (reprocess && onlyArg) usage("--reprocess 는 저장분 전체를 다시 추출합니다 — --only 와 함께 쓸 수 없습니다");
if (deriveOnly && onlyArg) usage("--derive-only 는 소스를 읽지 않습니다 — --only 와 함께 쓸 수 없습니다");

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
  if (unknown.length) usage(`알 수 없는 소스: ${unknown.join(", ")}`);
  targets = ids.map(findSource);
}

// ── 드라이런 — 수집·추출만 ──────────────────────────────────────────────
if (dryRun && !deriveOnly) {
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
const env = loadEnv(["ANTHROPIC_API_KEY"]);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) usage("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
guardTarget(url, allowRemote);
// --remote는 원격 URL을 허용할 뿐 대상을 바꾸지 않는다 — 대상은 환경변수(없으면 .env.local)다. 로컬 값인데 --remote를 붙였다면
// 원격 자격 증명을 싣지 않은 것이다(로컬에 --rejudge를 돌린 적이 있다) → 조용히 로컬에 쓰지 않고 멈춘다
if (allowRemote && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  usage(`--remote인데 대상이 로컬입니다(${url}) — 원격 자격 증명을 환경에 실으세요. 예: set -a; source .env.prod; set +a; node scripts/sync-transfer-news.mjs --remote …`);
}
const supabase = createSyncClient(url, key);

if (deriveOnly) {
  await derive({ dryRun, rejudge, replay });
  console.log(`\n대상: ${url}`);
  process.exit(process.exitCode ?? 0);
}

if (reprocess) {
  try {
    const s = await reprocessAll(supabase);
    console.log(`재처리: 읽음 ${s.read} · 갱신 ${s.updated} · 실패 ${s.failed}`);
    if (s.lostAttribution.length) {
      // 실패로 알린다 — 그 행들은 옛 저자 표기를 단 채 공개돼 있다(pipeline.mjs의 reprocessAll)
      console.error(`✗ 규칙 변경으로 귀속을 잃은 행 ${s.lostAttribution.length}건 — 지우지 않고 남겼습니다. 확인 후 삭제하세요`);
      console.error(`  id: ${s.lostAttribution.join(", ")}`);
    }
    if (s.unknownSource) console.warn(`⚠ 레지스트리에 없는 소스의 행 ${s.unknownSource}건 — 건드리지 않았습니다`);
    if (s.failed || s.lostAttribution.length) process.exitCode = 1;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
  await expand();
  await derive({ dryRun: false }); // 추출 컬럼(players·stage)이 바뀌었으니 딜도 다시 만든다
  console.log(`\n대상: ${url}`);
  process.exit(process.exitCode ?? 0);
}

const t0 = Date.now();
const results = await syncSources(supabase, targets);
printResults(results);
await expand();
// 소스가 실패해도 파생은 돈다 — 성공한 소스의 새 보도가 보드에 닿아야 한다. 종료 코드는 둘 중 하나라도 실패면 1이다
await derive({ dryRun: false });
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}초 · 대상: ${url}`);
process.exit(process.exitCode ?? 0);

// ─────────────────────────────────────────────────────────────────────

/** 가십 칼럼 → 항목 행. 파생보다 먼저 돈다. 칼럼을 받지 못한 것은 경고(다음 실행이 다시 받는다), 저장 실패만 종료 코드 1 */
async function expand() {
  try {
    const r = await expandRoundups(supabase);
    console.log(`\n가십 칼럼: 최근 ${r.columns}편 · 이번에 나눔 ${r.fetched}편 → 항목 ${r.items}건(새로 저장 ${r.inserted})${r.deferred ? ` · 다음 실행으로 ${r.deferred}편` : ""}`);
    for (const u of r.failed) console.warn(`⚠ 가십 칼럼을 받지 못했습니다(다음 실행에 다시): ${u}`);
  } catch (e) {
    console.error(`✗ 가십 칼럼 나누기 실패: ${e.message}`);
    process.exitCode = 1;
  }
}

/**
 * 딜 파생(+ LLM 판정·요약) — 결과 요약을 찍고, 행 단위 실패가 하나라도 있으면 종료 코드 1.
 * 키가 없으면 판정 없이 파생한다. 원격 실행에서 키가 없으면 실패다 — 조용히 지나가면 새 딜이 영영 열리지 않고 화면이 영문으로 남는다.
 * 판정이 계통적으로 실패해도(인증) 파생은 끝까지 쓴다(새 딜은 닫힘·기존 딜은 유지) — 종료 코드만 올린다.
 */
async function derive({ dryRun: summaryOnly, rejudge: again = false, replay: reread = false }) {
  try {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey && !summaryOnly) {
      const msg = "ANTHROPIC_API_KEY가 없어 LLM 판정·요약을 건너뜁니다 — 판정 없는 새 딜은 열리지 않습니다";
      if (allowRemote) { console.error(`✗ ${msg}`); process.exitCode = 1; } else console.log(`\n${msg}`);
    }
    const judge = apiKey
      ? async (needs, names) => {
          try {
            // --rejudge는 사람이 한 번에 끝내려고 돌리는 명령이다 — 실행당 상한을 크게 연다(비용은 호출부가 안다)
            console.log(`\nLLM 판정 시작: ${needs.length}건(한 건 3초 안팎 — 끝날 때까지 결과는 찍히지 않는다)`);
            return await runJudgements(supabase, needs, { apiKey, names, limit: again ? 1000 : undefined, log: console });
          } catch (e) {
            console.error(`✗ LLM 판정 실패: ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
            return { warnings: [], updates: [] };
          }
        }
      : null;
    const r = await runDerivation(supabase, { dryRun: summaryOnly, rejudge: again, replay: reread, judge });
    const s = r.summary;
    const stages = Object.entries(s.stages).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ") || "—";
    console.log(`\n딜 파생${summaryOnly ? "(드라이런)" : ""}: 딜 ${s.deals} · 구단 ${s.clubs} · 연결된 보도 ${s.linkedRows}건`);
    console.log(`  단계: ${stages}`);
    console.log(`  방향 채움 ${s.withDirection}(한쪽이라도 ${s.withAnyClub}, 출발은 현 소속 폴백 ${s.fromFallback}건) · 이적료 채움 ${s.withFee}`);
    const skipped = Object.entries(r.skipped).map(([k, v]) => `${k} ${v}`).join(" · ");
    if (skipped) console.log(`  건너뜀: ${skipped}`);
    if (r.lookup) console.log(`  이름 사전(위키데이터): 조회 ${r.lookup.tried} · 찾음 ${r.lookup.found} · 없음 ${r.lookup.notFound} · 실패 ${r.lookup.failed}`);
    if (r.clubLookup) console.log(`  현 소속(위키데이터 P54): 조회 ${r.clubLookup.tried} · 찾음 ${r.clubLookup.found} · 없음 ${r.clubLookup.notFound} · 실패 ${r.clubLookup.failed}`);
    if (r.replayed) console.log(`  원출력 재생(API 호출 없음): 대상 ${r.replayed.read} · 달라져 다시 쓴 것 ${r.replayed.changed} · 기사를 못 받아 건너뜀 ${r.replayed.skipped} · 지금 해석으로 이동 ${r.replayed.move} · 아님 ${r.replayed.notMove}(회고 ${r.replayed.retrospective} · 제목뿐 ${r.replayed.titleOnly}) · 불가 ${r.replayed.invalid}`);
    if (r.nameSync?.synced) console.log(`  이름 사전 맞춤(사람 사전 → 캐시): 표기 ${r.nameSync.synced}건 · 요약 ${r.nameSync.summariesFixed}건`);
    const j = r.judged;
    if (j && "read" in j) {
      console.log(`  LLM 판정·요약 · ${JUDGE_MODEL}: 대상 ${j.read} · 이동 ${j.move}(요약 ${j.summarized}, 요약 버림 ${j.summaryInvalid}) · 아님 ${j.notMove}(회고 ${j.retrospective ?? 0} · 제목뿐 ${j.titleOnly ?? 0} · 선수 미특정 ${j.unnamed ?? 0}) · 판정 불가 ${j.invalid} · 실패 ${j.failed} · 기사 본문 ${j.articles}(못 받음 ${j.articleMissing})`);
      console.log(`  토큰: 입력 ${j.inputTokens}(캐시 읽음 ${j.cacheReadTokens} · 캐시 씀 ${j.cacheWriteTokens}) · 출력 ${j.outputTokens}`);
    }
    for (const w of r.warnings) console.warn(`  ⚠ ${w}`);
    if (summaryOnly) {
      for (const d of r.deals.slice(0, 20)) {
        console.log(`  [${d.stage}] ${d.player}${d.player_ko ? `(${d.player_ko})` : ""} ${d.from_club_code ?? "?"} → ${d.to_club_code ?? "?"} ${d.fee_text ?? ""} ${d.wage_text ?? ""} ${d.contract_text ?? ""} · 보도 ${d.report_count}`);
      }
    } else {
      const w = r.write;
      console.log(`  저장(값이 바뀐 것만): 구단 ${w.clubs} · 딜 ${w.deals}(그대로 ${w.unchanged}) · 배정 ${w.linked} · 해제 ${w.unlinked} · 삭제 ${w.deleted}${w.failed ? ` · 실패 ${w.failed}` : ""}`);
      if (w.failed) process.exitCode = 1;
    }
  } catch (e) {
    console.error(`✗ 딜 파생 실패: ${e.message}`);
    process.exitCode = 1;
  }
}

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

/** 등록된 소스가 여전히 "그 사람 본인"인지, 미러가 출처를 밝히는지 확인한다 — 빈도가 높다고 좋은 소스가 아니다 */
async function verify() {
  console.log(`정기 실행 주기 상한: ${maxRunIntervalMinutes()}분 (가장 짧은 피드 보관시간 ÷ 3)\n`);
  for (const s of SOURCES.filter((x) => x.kind === "bluesky")) {
    try {
      const v = await verifyBlueskyAccount(s.config.handle);
      // 배지 없이 사람이 확인해 등록한 계정 — 배지를 기대하지 않는다. 계정이 살아 있는지와 배지가 새로 붙었는지만 알린다
      if (s.verification?.method) {
        console.log(`${s.id.padEnd(20)} ○ 수동 확인(${s.verification.method}, ${s.verification.checkedAt})  배지 ${v.issuerHandle ?? "—"}  팔로워 ${v.followersCount}`);
        continue;
      }
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
      // 퍼머링크를 달지 않는 채널(`permalinks: false` — 본인 사이트 글을 옮기는 채널)은 이 경고 대상이 아니다
      if (s.config.official && s.config.permalinks !== false && c.permalinkRatio < 0.5) {
        console.log("   ⚠ 퍼머링크가 절반 미만인데 공식 채널로 귀속 중이다 — 근거가 약하다");
        process.exitCode = 1;
      }
    } catch (e) {
      console.log(`${s.id.padEnd(20)} ✗ 조회 실패: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
