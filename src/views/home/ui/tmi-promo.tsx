import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

/** TMI 프로모 카드 — 옐로 🔥 박스 + 프로토타입 카피 (콘텐츠 컬러로서의 옐로) */
export function TmiPromo() {
  return (
    <section className="px-5">
      <Link
        href={ROUTES.tmi}
        aria-label="선수 TMI 진실 or 거짓으로 이동"
        className="flex items-center gap-3 rounded-xl border border-hairline bg-[#fffdf5] p-[18px]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-yellow text-[22px]">
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="block text-[15px] font-semibold text-ink">
            선수 TMI · 진실 or 거짓
          </h2>
          <span className="mt-0.5 block text-[12px] text-ink-mute">
            오늘 12개 떡밥이 들어왔어요. 진위는 다른 팬들이 가립니다.
          </span>
        </div>
        <Icon as={ChevronRight} size={18} className="shrink-0 text-ink-mute-2" />
      </Link>
    </section>
  );
}
