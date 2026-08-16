"use client";

import { Camera } from "lucide-react";
import { ROUTES, avatarUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Avatar, Button, EmptyState, Icon, Skeleton, TextField } from "@/shared/ui";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { SubHeader } from "@/widgets/sub-header";
import { useProfileQuery } from "@/entities/profile";
import { useSessionStore } from "@/entities/session";
import { NICKNAME_LIMIT } from "@/features/update-profile";
import { useAvatarUpload } from "../model/use-avatar-upload";
import { useLinkReturn } from "../model/use-link-return";
import { useNicknameForm } from "../model/use-nickname-form";
import { LinkedAccounts } from "./linked-accounts";

interface ProfileViewProps {
  /** 계정 연결에서 돌아왔는지 — 서버가 판정해 내려준다(app/profile/page.tsx 주석 참고) */
  linkPending: boolean;
  /** 프로바이더가 거부한 경우 (`?error=`) */
  errorCode: string | null;
  errorDescription: string | null;
}

/**
 * 프로필 화면 — 닉네임·사진 수정과 로그인 수단 연결.
 *
 * 닉네임은 가입 시 랜덤으로 배정되고(축구 테마 조합) 여기서 바꾼다.
 * 프로필 사진은 프로바이더 것을 쓰지 않고 직접 업로드받는다.
 *
 * ⚠ **이 화면은 OAuth 복귀 지점이기도 하다.** `linkIdentity`가 `?code=`를 들고 여기로
 *   돌아온다 → `/sign-in`과 같은 세 가지를 처리한다(nextjs.md): 교환 중 대기 표시, 상한,
 *   프로바이더의 `?error=`. 판정은 `use-link-return`이 갖는다.
 */
export function ProfileView({ linkPending, errorCode, errorDescription }: ProfileViewProps) {
  const user = useSessionStore((s) => s.user);
  const profile = useProfileQuery(user?.id);
  const nickname = useNicknameForm(user?.id, profile.data?.nickname);
  const avatar = useAvatarUpload(user?.id);
  const link = useLinkReturn(linkPending, errorCode, errorDescription);

  const header = <SubHeader title="프로필" fallbackHref={ROUTES.postList} />;
  /**
   * 이 화면은 하단 탭바의 두 목적지 중 하나다 — 탭으로 들어왔는데 탭바가 사라지면
   * 커뮤니티로 돌아갈 수단이 뒤로가기뿐이 된다. 상태 분기마다 함께 렌더한다.
   */
  const tabBar = <BottomTabBar active="프로필" />;
  /** 탭바는 떠 있으므로 스크롤 영역 하단을 비운다 — `TabScrollArea`와 같은 계산(72+18+여유) */
  const mainClassName = "h-full overflow-y-auto pb-[calc(122px+env(safe-area-inset-bottom))]";

  if (profile.isPending) {
    return (
      <>
        {header}
        <main className={cn(mainClassName, "flex flex-col gap-4 px-5 pt-8")}>
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="h-[50px] w-full" />
        </main>
        {tabBar}
      </>
    );
  }

  // 캐시가 있으면 화면을 유지하고 배너로만 알린다(목록·상세와 같은 규약)
  if (profile.error && !profile.data) {
    return (
      <>
        {header}
        <main className={mainClassName}>
          <EmptyState
            title="프로필을 불러오지 못했어요"
            description={profile.error.message}
            onRetry={() => void profile.refetch()}
          />
        </main>
        {tabBar}
      </>
    );
  }

  if (!profile.data) {
    return (
      <>
        {header}
        <main className={mainClassName}>
          <EmptyState title="프로필을 찾을 수 없어요" description="다시 로그인해 주세요." />
        </main>
        {tabBar}
      </>
    );
  }

  return (
    <>
      {header}
      <main className={mainClassName}>
        <h1 className="sr-only">프로필</h1>

        {/* 계정 연결에서 돌아왔다 — 프로바이더가 거부했으면 사유를, 교환 중이면 진행 상태를 알린다 */}
        {link.errorMessage && (
          <p
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[13px] leading-[1.5] text-crimson"
          >
            {link.errorMessage}
          </p>
        )}
        {!link.errorMessage && link.linking && (
          <p
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
          >
            계정을 연결하는 중이에요…
          </p>
        )}

        {profile.error && (
          <p
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
          >
            최신 정보를 불러오지 못했어요. 표시된 내용이 오래된 것일 수 있어요.
          </p>
        )}

        {/* 아바타 */}
        <section aria-labelledby="avatar-heading" className="flex flex-col items-center px-5 pt-8">
          <h2 id="avatar-heading" className="sr-only">
            프로필 사진
          </h2>
          <div className="relative">
            <Avatar
              label={profile.data.nickname}
              src={avatarUrl(profile.data.avatarPath)}
              size={96}
              className="text-[32px]"
            />
            <button
              type="button"
              onClick={avatar.open}
              disabled={avatar.isPending}
              aria-label="프로필 사진 바꾸기"
              className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border border-hairline-cool bg-canvas text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft disabled:opacity-40"
            >
              <Icon as={Camera} size={16} />
            </button>
          </div>
          <input type="file" {...avatar.inputProps} className="sr-only" />
          <p className="mt-3 text-[12px] text-ink-faint">
            {avatar.isPending ? "올리는 중…" : "JPG · PNG · WebP"}
          </p>
          {avatar.error && (
            <p className="mt-2 text-center text-[13px] text-crimson">{avatar.error.message}</p>
          )}
        </section>

        {/* 닉네임 */}
        <form onSubmit={nickname.onSubmit} className="flex flex-col gap-3 px-5 pt-8">
          <TextField
            label="닉네임"
            name="nickname"
            value={nickname.value}
            error={nickname.error}
            hint={`${NICKNAME_LIMIT.grapheme}자까지 · 다른 사람과 같을 수 없어요`}
            onChange={nickname.onChange}
          />
          <Button type="submit" block disabled={!nickname.canSave}>
            {nickname.isPending ? "저장 중…" : "닉네임 저장"}
          </Button>
        </form>

        {/* 로그인 수단 */}
        <LinkedAccounts userId={user?.id} />

        {user?.email && (
          <p className="px-5 pt-7 text-[12px] leading-[1.6] text-ink-faint">
            로그인 계정 · {user.email}
          </p>
        )}
      </main>
      {tabBar}
    </>
  );
}
