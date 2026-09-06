/**
 * 클라이언트 리사이즈의 목표 용량. **이 값을 넘기지 않는 것이 계약이다.**
 *
 * ⚠ 넘으면 거부하는 상한이 아니라 **맞출 때까지 내려가는 목표**다(아래 `LADDER`).
 *   거부는 사용자가 할 수 있는 일이 없는 막다른 길이라, 상한으로 두면 안 된다.
 *
 * 500KB가 적정한 이유 — 1600×1067 webp 실측(KB):
 *
 * | 사진 종류            | q0.85 | q0.80 | q0.72 |
 * |----------------------|------:|------:|------:|
 * | 깨끗(하늘·인물)      |    30 |    22 |    17 |
 * | 보통(주간 폰사진)    |   372 |   296 |   210 |
 * | 디테일 많음(관중·잔디)|   627 |   539 |   453 |
 * | 최악(야간 고ISO)     |   805 |   709 |   628 |
 *
 * 즉 **보통 사진은 최고 품질에서 이미 통과**해 손실이 없고, 사다리를 타는 것은 소수의
 * 고밀도·고노이즈 사진뿐이다. 300KB로 낮추면 보통 사진까지 품질을 깎아야 하고,
 * 1MB로 올려도 430px 프레임에서 얻는 것이 없다.
 */
export const IMAGE_TARGET_BYTES = 500 * 1024;

/**
 * 목표 용량에 닿을 때까지 내려가는 사다리.
 *
 * ⚠ **품질을 바닥까지 깎기 전에 치수를 줄인다.** 앱 프레임이 430px이라 1024px도 2.4배수라
 *   축소는 눈에 띄지 않지만, q0.62는 평평한 하늘·피부에서 밴딩으로 드러난다.
 *   실측으로도 최악 사진에서 `1600px q0.62`(581KB)보다 `1280px q0.72`(394KB)가
 *   **더 작으면서 더 깨끗하다** — 그래서 1600px의 품질 바닥을 0.78에서 끊는다.
 *
 * ⚠ 마지막 칸은 어떤 입력이든 목표 아래로 떨어지도록 넉넉히 잡는다. 사다리를 다 내려가고도
 *   넘치면 그건 계약이 깨진 것이므로 그때는 던진다(도달 불가에 가깝다).
 */
const LADDER = [
  { edge: 1600, quality: 0.85 },
  { edge: 1600, quality: 0.78 },
  { edge: 1280, quality: 0.78 },
  { edge: 1024, quality: 0.78 },
  { edge: 800, quality: 0.72 },
] as const;

/**
 * 이미지를 **비율을 유지한 채** webp로 줄인다. 결과는 항상 `IMAGE_TARGET_BYTES` 이하다.
 *
 * ⚠ **여기로 올라온 이유가 규약이다.** 원래 `features/write-post`에 있었고 그 주석이
 *   "세 번째 이미지 기능이 생기면 shared/lib으로 올린다"고 미리 적어 두었다 —
 *   어드민의 입축구 배경(`features/admin-survey`)이 그 세 번째이고, features끼리는
 *   import할 수 없어 승격 말고는 길이 없다.
 * ⚠ `features/update-profile`의 `resizeToAvatar`는 **함께 올리지 않는다.** 저쪽은 아바타가
 *   원형이라 가운데를 정사각으로 **잘라내는데**, 본문·배경 사진을 그렇게 자르면 내용이
 *   날아간다 — 형태가 진짜 같지 않으므로 공용화 대상이 아니다(code-quality.md).
 *
 * ⚠ **클라이언트 압축은 UX이지 방어가 아니다.** 우회하면 원본이 올라가므로 버킷의
 *   `file_size_limit`·`allowed_mime_types`가 실제 방어선이다(RLS와 같은 구조).
 */
export async function resizeToWebp(file: File): Promise<Blob> {
  /*
   * 이미 계약을 만족하는 webp는 **그대로 돌려준다.**
   *
   * ⚠ 재인코딩은 공짜가 아니다 — webp는 손실 압축이라 다시 굽는 것만으로 화질이 한 번 더
   *   깎인다. 300KB짜리 webp를 q0.85로 되구워 **화질만 잃는** 일이 실제로 일어난다.
   * ⚠ 치수는 보지 않는다. 사다리의 목적은 **용량**이고, 430px 프레임에서 긴 변이 1600px을
   *   넘든 말든 보이는 것이 달라지지 않는다 — 용량이 이미 목표 아래면 축소할 이유가 없다.
   * ⚠ **`file.type`을 믿으면 안 된다.** 브라우저가 파일 이름으로 붙이는 값이라, PNG의
   *   확장자만 `.webp`로 바꾸면 이 지름길로 새고 업로드는 `contentType: "image/webp"`를
   *   달아 보낸다 — 서버도 통과시켜 **열리지 않는 이미지**가 본문에 박힌다.
   *   내용으로 판정하면 디코딩까지 건너뛸 수 있어 더 빠르기도 하다.
   */
  if (file.size <= IMAGE_TARGET_BYTES && (await looksLikeWebp(file))) return file;

  // ⚠ 확장자만 바꾼 파일도 `file.type` 검사를 통과한다(브라우저가 이름으로 타입을 붙인다).
  //   디코딩이 여기서 터지면 DOMException의 영어 문장이 그대로 화면에 나간다.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    console.error("[image] 디코딩 실패:", e);
    throw new Error("이미지를 읽지 못했어요. 다른 사진을 골라 주세요.");
  }
  try {
    let smallest: Blob | null = null;
    for (const { edge, quality } of LADDER) {
      const blob = await encode(bitmap, edge, quality);
      if (blob.size <= IMAGE_TARGET_BYTES) return blob;
      smallest = blob; // 사다리는 단조 감소라 마지막이 항상 가장 작다
    }
    console.error("[image] 목표 용량에 닿지 못함:", smallest?.size);
    throw new Error("이미지를 충분히 줄이지 못했어요. 다른 사진을 골라 주세요.");
  } finally {
    // ⚠ 명시적으로 닫는다 — ImageBitmap은 GC를 기다리지 않고 메모리를 붙들고 있다
    bitmap.close();
  }
}

/** 긴 변을 `edge`로 맞춰(키우지는 않는다) webp로 인코딩한다 */
async function encode(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리하지 못했어요.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("이미지를 변환하지 못했어요.");
  return blob;
}

/** RIFF 컨테이너의 `RIFF....WEBP` 시그니처 — 내용으로 webp를 판정한다 */
async function looksLikeWebp(file: File): Promise<boolean> {
  if (file.size < 12) return false;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const tag = (at: number) => String.fromCharCode(...head.subarray(at, at + 4));
  return tag(0) === "RIFF" && tag(8) === "WEBP";
}
