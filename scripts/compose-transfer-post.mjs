/**
 * 수집한 이적 소식(`transfer_news`)으로 이적설 게시글을 조립해 출력한다. **DB에 쓰지 않는다.**
 *
 *   node scripts/compose-transfer-post.mjs "Alaba"              # 제목 + 마크다운을 stdout에
 *   node scripts/compose-transfer-post.mjs "Alaba" --out p.json  # {title, content, sources}를 파일로
 *   node scripts/compose-transfer-post.mjs "Alaba" --remote      # 원격 프로젝트에서 읽는다(명시적일 때만)
 *
 * 조립 규칙은 `scripts/lib/transfer/compose.mjs`가 갖는다(형식·안전 규칙이 거기 적혀 있다).
 * ⚠ 이적 기사가 아니거나 소속팀·행선지를 읽지 못하면 **글을 만들지 않고 종료 코드 1**이다 —
 *   틀린 사실을 담은 글이 게시되는 것보다 사람이 한 번 더 보는 편이 낫다.
 */
import { writeFileSync } from "node:fs";
import { createSyncClient, flag, guardTarget, loadEnv } from "./lib/sync-db.mjs";
import { composeTransferPost } from "./lib/transfer/compose.mjs";

const argv = process.argv.slice(2);
const outPath = flag(argv, "out");
const keyword = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
const KNOWN = new Set(["--out", "--remote"]);
const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN.has(a));
if (unknown.length || !keyword || (argv.includes("--out") && !outPath)) {
  console.error('사용: node scripts/compose-transfer-post.mjs "<선수 이름>" [--out <파일>] [--remote]');
  process.exit(1);
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  process.exit(1);
}
// ⚠ 원문 전문(body)은 공개 키로 읽을 수 없다 — 조립에 필요해 service_role로 읽는다
guardTarget(url, argv.includes("--remote"));

// 단어 경계로 찾는다 — 부분 일치("Read"가 "already"에 걸렸다)는 다른 이야기를 섞는다.
// 최종 판정은 조립 모듈이 다시 한다(여기는 후보를 좁히는 것뿐이다).
const pattern = `\\m${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\M`;
const { data, error } = await createSyncClient(url, key)
  .from("transfer_news")
  .select("id, source_id, attribution, stage, attributed_to, fee_text, players, body, url, published_at")
  .filter("body", "imatch", pattern)
  .order("published_at")
  .limit(200);
if (error) {
  console.error(`✗ 조회 실패: ${error.message}`);
  process.exit(1);
}

const post = composeTransferPost(data, keyword);
if ("error" in post) {
  console.error(`✗ ${post.error}`);
  process.exit(1);
}
if (outPath) writeFileSync(outPath, JSON.stringify(post, null, 2));
console.log(`${post.title}\n\n${post.content}`);
