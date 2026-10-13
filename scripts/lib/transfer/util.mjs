/**
 * 파이프라인 모듈이 함께 쓰는 작은 도구 — 운영 JSON 읽기와 배열 조각내기.
 *
 * ⚠ **잎 모듈이다** — `node:fs` 말고는 아무것도 import하지 않는다. 판정·파생이 함께 쓰는 순수 모듈(`windows.mjs`)도 이것을 쓰므로,
 *   여기서 다른 파이프라인 모듈을 import하면 그 모듈이 피하려는 순환 import가 생긴다.
 */
import { readFileSync } from "node:fs";

/** 읽은 JSON — 경로마다 한 번만 읽는다(한 실행에서 이름 사전·용어 사전을 여러 번 부른다) */
const jsonCache = new Map();

/** 캐시가 돌려주는 값을 호출부가 고치면 다음 호출부가 고친 값을 받는다 — 얼려서 그 실수를 던지게 한다(ES 모듈은 strict다) */
function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/**
 * 운영 JSON을 읽는다 — 프로세스 안에서 경로마다 한 번만 읽고 얼린 값을 돌려준다. 읽지 못하면 파일 경로를 담아 던진다
 * (실패는 캐시하지 않는다).
 * ⚠ 실행 도중 파일을 고쳐도 다시 읽지 않는다 — 운영 JSON은 사람이 커밋해 바꾸는 값이라 한 실행 안에서는 그대로다.
 * @param {URL} url 호출 모듈 기준으로 푼 경로(`new URL("./x.json", import.meta.url)`)
 */
export function readJson(url) {
  const hit = jsonCache.get(url.href);
  if (hit !== undefined) return hit;
  let value;
  try {
    value = JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
  jsonCache.set(url.href, deepFreeze(value));
  return value;
}

/** DB의 `in.(…)` 조회·쓰기를 나누는 기본 크기 — URL 길이 한도 안에 든다 */
export const CHUNK = 100;

/** 배열을 `size`개씩 자른다 */
export const chunks = (arr, size = CHUNK) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
