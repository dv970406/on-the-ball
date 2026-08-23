import { env } from "./env";

/**
 * 공개 버킷의 경로 → 공개 URL. 순수 함수라 서버에서도 쓸 수 있다("use client" 없음).
 *
 * ⚠ **세 번째 버킷이 생겨서 묶었다.** `avatarUrl`·`postImageUrl`이 같은 한 줄을 각자 갖고
 *   있었는데, `reuse.md`가 "중복 2회는 중복을 둔다 — 세 번째 버킷이 생기면 그때 묶는다"고
 *   미리 정해 둔 그 시점이다(`code-quality.md`의 공용화 기준).
 *
 * ⚠ **DB에는 경로만 저장한다.** 전체 URL을 저장하면 로컬(127.0.0.1:64321)과
 *   원격(*.supabase.co)의 호스트가 달라 환경을 옮길 때마다 모든 행이 깨진다.
 *   조립은 여기 한 곳에서만 한다.
 *   ⚠ 예외가 하나 있다 — 본문 이미지는 URL을 `post.content`에 담는다. 그쪽은 사용자가
 *     외부 주소도 적을 수 있는 **자유 텍스트**라 형태를 강제할 자리가 없다(api-and-db.md).
 */
export function publicStorageUrl(bucket: string, path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
