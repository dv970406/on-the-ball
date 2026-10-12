import { useId, type ReactNode } from "react";

interface ProfileSectionProps {
  title: string;
  /** 제목 아래 설명 한 줄 — 없으면 그리지 않는다(계정 섹션은 이메일이 있을 때만) */
  description?: ReactNode;
  /**
   * 그 섹션의 동작이 실패한 사유 — 섹션 맨 끝에 지속 표시로 남긴다(토스트는 곧 사라진다).
   * 언제 내는지는 섹션마다 다르므로 판정은 호출부가 하고 여기는 값만 받는다.
   */
  error?: string | null;
  children?: ReactNode;
}

/**
 * 프로필 화면의 설정 섹션 하나 — 제목(h2) · 설명 · 본문 · 실패 사유의 골격.
 *
 * ⚠ 섹션 사이의 여백·제목·설명의 모양은 여기 한 곳이 갖는다 — 섹션마다 따로 적으면 여백이 조용히 갈린다.
 * ⚠ 아바타 섹션은 이 골격이 아니다(제목이 `sr-only`이고 가운데 정렬이다).
 */
export function ProfileSection({ title, description, error, children }: ProfileSectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="px-5 pt-7">
      <h2 id={headingId} className="section-title">
        {title}
      </h2>
      {description && <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">{description}</p>}

      {children}

      {error && <p className="mt-3 text-[13px] leading-[1.5] text-crimson">{error}</p>}
    </section>
  );
}
