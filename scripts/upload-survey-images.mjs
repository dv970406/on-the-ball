/**
 * 입축구 면 배경 이미지를 `survey-images` 버킷에 올린다.
 *
 *   node scripts/upload-survey-images.mjs <이미지_디렉터리>
 *
 * ⚠ **이 버킷에는 쓰기 정책이 없다.** 문항 자체를 마이그레이션이 넣는 것과 같은 취급이라
 *   앱에는 업로드 경로가 아예 없다 → 여기서 **service_role 키**로 올린다.
 *   그래서 이 스크립트는 로컬·배포 운영자만 돌린다.
 *
 * ⚠ 파일명이 곧 `survey_option.image_path`의 뒷부분이다. 경로 형태
 *   `{survey_id}/{파일명}`은 DB CHECK가 강제하므로 디렉터리 이름을 survey id로 둔다.
 *   예) `<디렉터리>/5/messi.png` → `image_path = '5/messi.png'`
 *
 * ⚠ 같은 경로로 다시 올리면 **URL이 그대로라 브라우저·CDN 캐시에 옛 이미지가 남는다**
 *   (아바타가 업로드마다 uuid를 새로 뽑는 것과 같은 이유). 사진을 바꿀 때는 파일명도 바꾼다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "survey-images";
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const root = process.argv[2];
if (!root) {
  console.error("사용법: node scripts/upload-survey-images.mjs <이미지_디렉터리>");
  process.exit(1);
}

// ⚠ `.env.local`을 직접 읽는다 — 이 스크립트는 Next 런타임 밖이라 자동 주입이 없다
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env.local에 필요합니다");
  process.exit(1);
}

// ⚠ **로컬 스택만 대상으로 한다.** 이 스크립트가 읽는 `.env.local`에는 원격 프로젝트의
//   DB 비밀번호·액세스 토큰이 함께 들어 있다 — URL 한 줄을 원격으로 돌려놓고 대시보드에서
//   service_role 키를 붙이는 순간, 확인 프롬프트 없이 원격 스토리지를 덮어쓰게 된다.
//   `api-and-db.md`가 "원격을 바꾸는 명령"을 셋으로 못박아 둔 이유가 그것이고,
//   이 가드가 없으면 그 목록이 조용히 넷이 된다.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(`로컬 스택만 대상입니다 — NEXT_PUBLIC_SUPABASE_URL이 ${url} 입니다.`);
  console.error("원격 버킷에 올려야 한다면 그 의도를 명시적으로 밝히고 별도 경로로 진행하세요.");
  process.exit(1);
}

let uploaded = 0;
for (const dir of readdirSync(root)) {
  if (!statSync(join(root, dir)).isDirectory()) continue;
  for (const file of readdirSync(join(root, dir))) {
    const ext = file.slice(file.lastIndexOf("."));
    const type = MIME[ext];
    if (!type) continue;

    const path = `${dir}/${file}`;
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        // ⚠ **`apikey`를 함께 보낸다.** 새 키 형식(`sb_secret_…`)은 JWT가 아니라서
        //   Authorization만 주면 storage가 JWT로 파싱하려다 "Invalid Compact JWS"로 죽는다.
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": type,
        "x-upsert": "true",
      },
      body: readFileSync(join(root, dir, file)),
    });
    if (!res.ok) {
      console.error(`✗ ${path} — ${res.status} ${await res.text()}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`✓ ${path}`);
    uploaded++;
  }
}
console.log(`\n${uploaded}개 업로드 완료 (버킷: ${BUCKET})`);
