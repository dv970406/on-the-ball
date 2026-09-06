import { IMAGE_TARGET_BYTES } from "@/shared/lib";
import { muxAnimatedWebp, type WebpFrame } from "./webp-mux";

/**
 * 움직이는 GIF → **애니메이션 WebP**.
 *
 * ⚠ `createImageBitmap`은 GIF의 **첫 프레임만** 준다(실측). 프레임을 모두 얻으려면
 *   `ImageDecoder`(WebCodecs)가 필요한데 **Chromium 계열에만 있다** — Safari·Firefox에는 없다.
 *   그 브라우저에서는 "움직임이 사라진 한 장"을 조용히 올리지 않고 사실대로 알리고 멈춘다.
 */

/** 프레임 상한. 넘으면 **고르게 솎아** 전체 길이를 보존한다(뒤를 자르지 않는다) */
const MAX_FRAMES = 48;

/** 디코딩 시점에 이미 여기까지 줄여서 받는다 — 사다리 첫 칸의 치수와 같다 */
const DECODE_EDGE = 480;

/**
 * GIF 딜레이의 하한. 0·10ms 같은 값은 모든 브라우저가 렌더 시 100ms로 올려주는 오래된
 * 관례가 있어서, 그대로 실으면 **원본 GIF보다 빠르게 재생되는 webp**가 나온다.
 */
const MIN_DELAY_MS = 20;
const DEFAULT_DELAY_MS = 100;

/**
 * 목표 용량에 닿을 때까지 내려가는 사다리.
 *
 * ⚠ 정지 이미지와 **레버가 다르다.** 프레임 수가 용량을 지배하므로, 치수·품질보다
 *   **프레임 솎기(`frameStep`)가 가장 크게 듣는다.** 리액션 GIF는 12fps여도 충분해서
 *   절반으로 솎아도 눈에 잘 띄지 않는 반면, 품질을 0.6 아래로 내리면 평평한 면이 뭉갠다.
 *
 * ⚠ **마지막 칸은 실제로 도달 가능해야 한다.** 한때 5칸에서 끊었더니 노이즈가 많은
 *   60프레임 GIF가 사다리를 다 내려가고도 521KB로 남아 거부됐다 — "어떤 입력이든 목표
 *   아래로"라는 계약이 깨져 있었다. 아래 두 칸이 그 꼬리를 받는다.
 */
const LADDER = [
  { edge: 480, quality: 0.75, frameStep: 1 },
  { edge: 480, quality: 0.66, frameStep: 1 },
  { edge: 400, quality: 0.66, frameStep: 2 },
  { edge: 320, quality: 0.62, frameStep: 2 },
  { edge: 320, quality: 0.58, frameStep: 3 },
  { edge: 240, quality: 0.58, frameStep: 4 },
  { edge: 200, quality: 0.52, frameStep: 6 },
] as const;

interface RawFrame {
  bitmap: ImageBitmap;
  durationMs: number;
}

/**
 * 움직이는 GIF면 애니메이션 webp, **정지 GIF면 `null`**(호출부가 일반 이미지 경로로 보낸다).
 *
 * ⚠ 디코더를 **한 번만** 만든다. 한때 프레임 수 확인과 변환이 각자 디코더를 만들어
 *   파일 전체를 두 번 복사했다(7.5MB GIF에서 15MB 복사). 닫는 것도 잊고 있었다.
 */
export async function animatedGifToWebp(file: File): Promise<Blob | null> {
  // 이 브라우저가 GIF 프레임을 낱장으로 꺼낼 수 있는가
  if (typeof ImageDecoder === "undefined") {
    throw new Error("이 브라우저에서는 움직이는 이미지를 올릴 수 없어요. 사진으로 올려 주세요.");
  }

  let decoder: ImageDecoder | undefined;
  let frames: RawFrame[] = [];
  try {
    try {
      decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
      await decoder.tracks.ready;
      await decoder.completed;
    } catch (e) {
      console.error("[post] GIF 디코딩 실패:", e);
      throw new Error("이미지를 읽지 못했어요. 다른 파일을 골라 주세요.");
    }

    const track = decoder.tracks.selectedTrack;
    // 프레임이 하나면 애니메이션 컨테이너를 씌울 이유가 없다 — 일반 경로가 더 작고 단순하다
    if (!track || track.frameCount <= 1) return null;

    frames = await decodeFrames(decoder, track.frameCount);
    // 헤더는 멀쩡한데 프레임이 하나도 안 나오는 파일이 있다 — 아래 frames[0] 접근을 지킨다
    if (frames.length === 0) throw new Error("이미지를 읽지 못했어요. 다른 파일을 골라 주세요.");

    const loopCount = loopCountOf(track);
    const { width, height } = frames[0].bitmap;
    let smallest: Blob | null = null;

    for (const rung of LADDER) {
      const blob = await encodeAnimation(frames, width, height, loopCount, rung);
      if (blob.size <= IMAGE_TARGET_BYTES) return blob;
      smallest = blob;
    }
    console.error("[post] GIF를 목표 용량으로 줄이지 못함:", smallest?.size);
    throw new Error("움직이는 이미지가 너무 커요. 더 짧은 것으로 올려 주세요.");
  } finally {
    // ⚠ ImageBitmap은 GC를 기다리지 않고 메모리를 붙들고 있다 — 실패 경로에서도 반드시 닫는다
    for (const f of frames) f.bitmap.close();
    decoder?.close();
  }
}

/**
 * GIF 프레임을 비트맵 + 지속시간으로 편다.
 *
 * ⚠ **디코딩 시점에 이미 축소해서 받는다.** 원본 해상도 비트맵을 전부 들고 있으면
 *   1920×1080 60프레임에서 500MB에 육박한다(실측 추정) — 사다리의 최대 치수가 480px이라
 *   원본 해상도를 유지할 이유가 없다.
 * ⚠ 상한을 넘으면 **뒤를 자르지 않고 고르게 솎는다.** 자르면 뒷부분이 통째로 사라지는데
 *   사용자에게 아무 말도 하지 않게 된다(실측: 100프레임 5초 → 60프레임 3초).
 */
async function decodeFrames(decoder: ImageDecoder, frameCount: number): Promise<RawFrame[]> {
  const step = Math.max(1, Math.ceil(frameCount / MAX_FRAMES));
  const frames: RawFrame[] = [];
  try {
    for (let i = 0; i < frameCount; i += step) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        const scale = Math.min(1, DECODE_EDGE / Math.max(image.displayWidth, image.displayHeight));
        const bitmap = await createImageBitmap(image, {
          resizeWidth: Math.max(1, Math.round(image.displayWidth * scale)),
          resizeHeight: Math.max(1, Math.round(image.displayHeight * scale)),
          resizeQuality: "high",
        });
        // 솎아낸 프레임의 시간을 합쳐 전체 재생 길이를 지킨다
        const span = Math.min(step, frameCount - i);
        frames.push({ bitmap, durationMs: delayOf(image) * span });
      } finally {
        image.close();
      }
    }
  } catch (e) {
    // ⚠ 중간이 잘린 GIF는 `tracks.ready`·`completed`가 **모두 성공한 뒤** decode에서 터진다
    //   (실측: "Unexpected end of image"). 여기서 잡지 않으면 영어 문장이 그대로 나가고,
    //   이미 만든 비트맵도 새어 나간다.
    console.error("[post] GIF 프레임 디코딩 실패:", e);
    for (const f of frames) f.bitmap.close();
    throw new Error("이미지를 읽지 못했어요. 다른 파일을 골라 주세요.");
  }
  return frames;
}

/** WebCodecs의 duration은 **마이크로초**다. GIF 관례에 맞춰 하한을 올린다 */
function delayOf(image: VideoFrame): number {
  const ms = image.duration ? Math.round(image.duration / 1000) : DEFAULT_DELAY_MS;
  return ms < MIN_DELAY_MS ? DEFAULT_DELAY_MS : ms;
}

/**
 * WebP의 loop count는 0이 무한이다.
 * ⚠ `repetitionCount`의 단위(반복 횟수 vs 재생 횟수)가 명세상 모호해, 유한값은 그대로 싣되
 *   최소 1로 잡는다. 리액션 GIF는 대부분 무한이라 실사용에서는 0으로 간다.
 */
function loopCountOf(track: { repetitionCount?: number }): number {
  const n = track.repetitionCount;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(0xffff, n)) : 0;
}

async function encodeAnimation(
  frames: RawFrame[],
  srcWidth: number,
  srcHeight: number,
  loopCount: number,
  { edge, quality, frameStep }: (typeof LADDER)[number],
): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리하지 못했어요.");

  const encoded: WebpFrame[] = [];
  for (let i = 0; i < frames.length; i += frameStep) {
    // ⚠ 솎아낸 프레임의 시간을 **남는 프레임에 합친다.** 안 그러면 재생이 그만큼 빨라진다.
    let durationMs = 0;
    for (let j = i; j < Math.min(i + frameStep, frames.length); j += 1) {
      durationMs += frames[j].durationMs;
    }
    // ⚠ 프레임마다 지운다 — GIF는 부분 갱신(dispose)을 쓰는데 ImageDecoder가 이미
    //   완성된 프레임을 주므로, 남은 픽셀이 비쳐 보이지 않게 매번 비운다.
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(frames[i].bitmap, 0, 0, width, height);
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!webp) throw new Error("이미지를 변환하지 못했어요.");
    encoded.push({ webp, durationMs });
  }

  return muxAnimatedWebp(encoded, width, height, loopCount);
}
