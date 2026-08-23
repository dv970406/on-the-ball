"use client";

import { Camera } from "lucide-react";
import { ROUTES, avatarUrl } from "@/shared/config";
import { Avatar, Button, EmptyState, Icon, Skeleton, TextField } from "@/shared/ui";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { SubHeader } from "@/widgets/sub-header";
import { useProfileQuery } from "@/entities/profile";
import { useSessionStore } from "@/entities/session";
import { NICKNAME_LIMIT } from "@/features/update-profile";
import { useAvatarUpload } from "../model/use-avatar-upload";
import { useLinkReturn } from "../model/use-link-return";
import { useNicknameForm } from "../model/use-nickname-form";
import { BlockedUsers } from "./blocked-users";
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
  const tabBar = <BottomTabBar />;
  /**
   * 탭바는 떠 있으므로 스크롤 영역 하단을 비운다 — `TabScrollArea`와 같은 계산(72+18+여유).
   * ⚠ `h-full`이 아니라 `min-h-0 flex-1` — SubHeader와 형제라 `h-full`이면 프레임이 헤더
   *   높이(71px)만큼 넘쳐, 하단 버튼에 포커스가 가는 순간 화면이 밀리고 되돌릴 수 없다.
   * ⚠ `relative` — 숨은 파일 input의 `sr-only`(position:absolute)가 프레임까지 새지 않게 한다.
   */
  const mainClassName =
    "relative min-h-0 flex-1 overflow-y-auto pb-[calc(122px+env(safe-area-inset-bottom))]";

  /*
   * ⚠ **로딩을 화면 전체의 조기 반환으로 두지 않는다.**
   *   전에는 `if (profile.isPending) return <스켈레톤>`이라 아래 `LinkedAccounts`·`BlockedUsers`가
   *   **마운트조차 되지 않았다** — 세 쿼리는 서로 의존이 없는데 프로필이 끝난 뒤에야 나머지 둘이
   *   출발하는 직렬 워터폴이 됐다(이 화면은 서버 프리페치도 없어 전부 클라이언트 왕복이다).
   *   지금은 프로필 자리만 스켈레톤으로 두고 나머지는 그대로 그려 셋이 동시에 출발한다.
   * ⚠ 아래 두 분기는 그대로 조기 반환이다 — 프로필이 아예 없으면 이 화면에 그릴 것이 없다.
   */

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

  // ⚠ `isPending`을 함께 본다 — 위 조기 반환이 사라져 로딩 중에도 여기 걸리던 자리다.
  if (!profile.isPending && !profile.data) {
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

        {/*
          프로필만 아직 안 왔다 — 실물과 같은 골격의 스켈레톤을 둔다(치수가 다르면 도착 순간 시프트).
          아래 두 섹션은 자기 쿼리를 갖고 이미 출발해 있다.
        */}
        {!profile.data && (
          <>
              <div className="flex flex-col items-center px-5 pt-8">
                <Skeleton className="size-24 rounded-full" />
                <Skeleton className="mt-3 h-[18px] w-24" />
              </div>
              <div className="flex flex-col gap-3 px-5 pt-8">
                <Skeleton className="h-[70px] w-full" />
                <Skeleton className="h-[50px] w-full" />
              </div>
          </>
        )}

        {profile.data && (
          <>
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
          </>
        )}

        {/* 로그인 수단 */}
        <LinkedAccounts userId={user?.id} />

        <BlockedUsers userId={user?.id} />

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
