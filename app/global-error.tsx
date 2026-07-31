"use client"; // 에러 바운더리는 클라이언트 컴포넌트여야 한다 (Next 규약)

import "@/app/styles/globals.css";

/**
 * 최후의 안전망 — 루트 layout/template 렌더가 실패했을 때 그 자리를 대체한다.
 * 활성화되면 루트 layout이 사라지므로 html·body와 전역 스타일을 직접 갖춰야 한다.
 * 이 화면마저 깨지면 남는 게 없으므로, 공용 UI 컴포넌트에 기대지 않고 마크업을 직접 쓴다.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-canvas px-8 text-center">
          <p className="text-[15px] font-medium text-ink">
            앱을 불러오지 못했어요
          </p>
          <p className="text-[13px] leading-relaxed text-ink-mute">
            잠시 후 다시 시도해 주세요.
            {/* 프로덕션에서는 message가 가려지므로 서버 로그 대조용 digest를 노출한다 */}
            {error.digest && (
              <>
                <br />
                <span className="text-[11px]">오류 코드 {error.digest}</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-3 inline-flex items-center justify-center rounded-sm bg-ink px-3 py-2 text-[13px] font-medium leading-none text-white"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
