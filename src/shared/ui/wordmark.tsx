/** 온더볼 워드마크 — 에메랄드 볼 + 로고타입 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[19px] font-semibold tracking-[-0.4px] text-ink">
      <span className="relative mr-1.5 inline-block size-4 overflow-hidden rounded-full bg-primary">
        <span className="absolute left-[5.5px] top-[5.5px] size-[5px] rounded-full bg-ink" />
      </span>
      온더볼
    </span>
  );
}
