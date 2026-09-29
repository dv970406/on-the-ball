import { env } from "./env";

/**
 * 공개 버킷의 경로 → 공개 URL 조립의 **단일 소스**. 순수 함수라 서버에서도 쓸 수 있다("use client" 없음).
 * 버킷별 함수(`avatarUrl`)는 이 함수를 감싸기만 한다 — 새 공개 버킷이 생기면 같은 형태로 붙인다(`reuse.md`).
 *
 * ⚠ **DB에는 경로만 저장한다.** 전체 URL을 저장하면 로컬(127.0.0.1:64321)과
 *   원격(*.supabase.co)의 호스트가 달라 환경을 옮길 때마다 모든 행이 깨진다.
 *   조립은 여기 한 곳에서만 한다.
 */
export function publicStorageUrl(bucket: string, path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
