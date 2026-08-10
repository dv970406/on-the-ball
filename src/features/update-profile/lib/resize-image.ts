/** 아바타 한 변의 최대 길이 — 화면에서 가장 크게 쓰는 곳이 96px이라 2배수로 충분하다 */
const MAX_SIZE = 512;

/** 버킷의 `allowed_mime_types`와 맞춘다(마이그레이션 20260809000001) */
export const ACCEPTED_IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

/**
 * 리사이즈 **전** 원본의 상한 — 브라우저 메모리를 지키기 위한 값이다.
 *
 * ⚠ 버킷의 `file_size_limit`(2MiB)에서 파생시키지 않는다. 둘은 함께 바뀔 이유가 없다 —
 *   하나는 서버 제약의 미러이고 이건 클라이언트 디코딩 비용의 상한이다. 전에 `*10`으로
 *   묶어 두었더니 (a) 버킷 제한을 올리면 메모리 방어선이 따라 늘고,
 *   (b) 2MiB×10 = 20.97MB인데 안내는 "20MB"라 경계에서 말과 동작이 갈렸다.
 */
export const MAX_SOURCE_BYTES = 20 * 1000 * 1000;

/**
 * 버킷의 `file_size_limit`(2MiB)을 미러링한다(마이그레이션 20260809000001).
 * 변환 결과가 이걸 넘으면 **기존 사진을 지우기 전에** 멈춘다 — 서버가 413으로 거부하는
 * 것과 결과는 같지만, 그때는 이미 옛 사진이 사라진 뒤다.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * 이미지를 정사각 512px webp로 줄인다.
 *
 * ⚠ **클라이언트 리사이즈는 UX이지 방어가 아니다.** 우회하면 원본이 올라가므로
 *   버킷의 `file_size_limit`·`allowed_mime_types`가 실제 방어선이다(RLS와 같은 구조).
 *   여기서 줄이는 이유는 폰 사진 그대로 올리면 2MiB 제한에 걸려 실패하기 때문이다.
 *
 * ⚠ 가운데를 정사각으로 잘라낸다 — 아바타가 원형이라 비율이 어긋나면 찌그러진다.
 */
export async function resizeToAvatar(file: File): Promise<Blob> {
  // ⚠ 확장자만 바꾼 파일도 `file.type` 검사를 통과한다(브라우저가 이름으로 타입을 붙인다).
  //   디코딩이 여기서 터지면 DOMException의 영어 문장이 화면에 그대로 나갔다.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    console.error("[profile] 이미지 디코딩 실패:", e);
    throw new Error("이미지를 읽지 못했어요. 다른 사진을 골라 주세요.");
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const target = Math.min(side, MAX_SIZE);

    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 처리하지 못했어요.");

    // 가운데 정사각 crop → target으로 축소
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) throw new Error("이미지를 변환하지 못했어요.");
    return blob;
  } finally {
    // ⚠ 명시적으로 닫는다 — ImageBitmap은 GC를 기다리지 않고 메모리를 붙들고 있다
    bitmap.close();
  }
}
