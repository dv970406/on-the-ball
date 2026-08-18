/**
 * 정지 WebP 여러 장을 **애니메이션 WebP 한 장**으로 묶는다 (RIFF 컨테이너 조립).
 *
 * ⚠ **왜 WASM 인코더를 들이지 않는가.** 브라우저에는 이미 WebP 인코더가 있다
 *   (`canvas.toBlob("image/webp")`) — 없는 것은 "여러 프레임과 딜레이를 넣을 API"뿐이다.
 *   그런데 그 인코더가 뱉는 파일은 `RIFF/WEBP + VP8X + ICCP + [ALPH] + VP8` 구조라(실측),
 *   비트스트림 청크(`ALPH`·`VP8 `·`VP8L`)를 그대로 꺼내 `ANMF` 프레임으로 다시 감싸면
 *   애니메이션이 된다. 검증: 3프레임을 묶어 `ImageDecoder`로 되읽으니
 *   `animated: true`, `frameCount: 3`, 프레임별 색까지 정확했다.
 *
 * ⚠ **바이트를 숫자 배열로 다루지 않는다.** 한때 `push(...bytes)`·`[...bytes]`로 조립했는데,
 *   `push`의 인자 개수 한계(V8 실측 **124,139개**)에 걸려 **프레임 하나가 그보다 크면
 *   `RangeError: Maximum call stack size exceeded`로 죽었다.** 480×480 GIF는 사다리 첫 칸에서
 *   축소가 일어나지 않아 프레임이 136KB까지 나오는데, 그게 정확히 이 기능의 주 대상이라
 *   **480px 원본 GIF가 100% 실패했다**(역설적으로 큰 GIF는 축소돼 살아남았다).
 *   숫자 배열은 바이트당 8바이트 이상의 힙도 쓴다 — `Uint8Array`로 조립하는 편이 모든 면에서 낫다.
 *
 * ⚠ **프레임마다 붙는 `ICCP`(색 프로필)를 버린다.** 프레임당 456바이트라 30프레임이면
 *   13KB가 색 프로필로만 나간다. 실측: 3프레임 2,334바이트 → 350바이트.
 *
 * 참고: WebP 컨테이너 명세(VP8X/ANIM/ANMF)를 그대로 따른다.
 */

const RIFF_HEADER_BYTES = 12;

/** VP8X 플래그 — 애니메이션(0x02) + 알파(0x10) */
const VP8X_FLAGS = 0x12;

/** 24비트 필드의 최댓값. 프레임 지속시간·캔버스 치수가 여기에 담긴다 */
const U24_MAX = 0xffffff;

const ascii = (s: string) => new TextEncoder().encode(s);

const u32le = (n: number) =>
  new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);

/** ⚠ 넘치면 **조용히 잘리지 않게** 상한으로 자른다(잘린 값이 0이 되면 프레임이 순간이동한다) */
const u24le = (n: number) => {
  const v = Math.max(0, Math.min(U24_MAX, Math.round(n)));
  return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255]);
};

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** RIFF 청크 하나. 크기가 홀수면 패딩 1바이트가 붙는다(명세) — `Uint8Array`가 0으로 시작하니 그대로 둔다 */
function chunk(id: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length + (payload.length & 1));
  out.set(ascii(id), 0);
  out.set(u32le(payload.length), 4);
  out.set(payload, 8);
  return out;
}

/**
 * 정지 WebP에서 **비트스트림 청크만** 뽑는다.
 * `ANMF` 안에 들어갈 수 있는 것은 `ALPH`·`VP8 `·`VP8L`뿐이라 나머지(`VP8X`·`ICCP`…)는 버린다.
 */
async function bitstreamChunks(webp: Blob): Promise<Uint8Array> {
  const bytes = new Uint8Array(await webp.arrayBuffer());
  const id = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  const size = (at: number) =>
    bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);

  const kept: Uint8Array[] = [];
  let offset = RIFF_HEADER_BYTES;
  while (offset + 8 <= bytes.length) {
    const name = id(offset);
    const len = size(offset + 4);
    const total = 8 + len + (len & 1);
    if (name === "ALPH" || name === "VP8 " || name === "VP8L") {
      kept.push(bytes.subarray(offset, offset + total));
    }
    offset += total;
  }
  return concat(kept);
}

export interface WebpFrame {
  /** `canvas.toBlob("image/webp")`가 만든 정지 프레임 */
  webp: Blob;
  durationMs: number;
}

/**
 * @param loopCount 0이면 무한 반복(GIF의 기본값과 같다)
 */
export async function muxAnimatedWebp(
  frames: WebpFrame[],
  width: number,
  height: number,
  loopCount = 0,
): Promise<Blob> {
  const parts: Uint8Array[] = [];

  // 캔버스 크기는 **1을 뺀 값**으로 적는다(명세: width-1, height-1)
  parts.push(
    chunk("VP8X", concat([new Uint8Array([VP8X_FLAGS, 0, 0, 0]), u24le(width - 1), u24le(height - 1)])),
  );
  // ANIM: 배경색(BGRA, 투명) + 반복 횟수
  parts.push(
    chunk("ANIM", new Uint8Array([0, 0, 0, 0, loopCount & 255, (loopCount >> 8) & 255])),
  );

  for (const frame of frames) {
    parts.push(
      chunk(
        "ANMF",
        concat([
          u24le(0), // frame x (2px 단위)
          u24le(0), // frame y
          u24le(width - 1),
          u24le(height - 1),
          u24le(frame.durationMs),
          new Uint8Array([0x00]), // blend=alpha, dispose=none
          await bitstreamChunks(frame.webp),
        ]),
      ),
    );
  }

  const body = concat(parts);
  const riff = concat([ascii("RIFF"), u32le(4 + body.length), ascii("WEBP"), body]);
  return new Blob([riff], { type: "image/webp" });
}
