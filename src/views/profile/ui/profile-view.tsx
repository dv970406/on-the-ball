"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera } from "lucide-react";
import { ROUTES, avatarUrl } from "@/shared/config";
import { useToast } from "@/shared/lib";
import { Avatar, Button, EmptyState, Icon, Skeleton, TextField } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { useProfileQuery } from "@/entities/profile";
import { useSessionStore } from "@/entities/session";
import {
  ACCEPTED_IMAGE_TYPES,
  NICKNAME_MAX,
  useUpdateAvatar,
  useUpdateNickname,
  validateNickname,
} from "@/features/update-profile";
import { LinkedAccounts } from "./linked-accounts";

interface ProfileViewProps {
  /** 계정 연결에서 돌아왔는지 — 서버가 판정해 내려준다(app/profile/page.tsx 주석 참고) */
  linkPending: boolean;
  /** 프로바이더가 거부한 경우 (`?error=`) */
  errorCode: string | null;
  errorDescription: string | null;
}

/**
 * 계정 연결에서 돌아왔을 때 프로바이더가 돌려준 실패 사유.
 * ⚠ 원문은 영어다. 동의 취소(access_denied)가 대부분이라 그것만 따로 옮기고 나머지는 원문을
 *   함께 보여준다 — 삼키면 지원 문의에 아무 단서도 남지 않는다.
 * ⚠ `sign-in-view.tsx`에 같은 모양의 함수가 있지만 **공용화하지 않는다.** 사용처가 2회이고
 *   문구가 서로 다르다(로그인 vs 연결) — code-quality.md의 "중복 3회 이상일 때만 공용화".
 */
function toLinkErrorMessage(code: string, description: string | null): string {
  if (code === "access_denied") return "계정 연결을 취소했어요.";
  return description ? `계정을 연결하지 못했어요. (${description})` : "계정을 연결하지 못했어요.";
}

/**
 * 프로필 화면 — 닉네임·사진 수정과 로그인 수단 연결.
 *
 * 닉네임은 가입 시 랜덤으로 배정되고(축구 테마 조합) 여기서 바꾼다.
 * 프로필 사진은 프로바이더 것을 쓰지 않고 직접 업로드받는다.
 *
 * ⚠ **이 화면은 OAuth 복귀 지점이기도 하다.** `linkIdentity`가 `?code=`를 들고 여기로
 *   돌아온다 → `/sign-in`과 같은 세 가지를 처리해야 한다(nextjs.md): 교환 중 대기 표시,
 *   상한, 프로바이더의 `?error=`. 상한은 여기서 별도로 두지 않는다 — 이 화면은 이미
 *   렌더돼 있고 교환이 실패해도 프로필 자체는 정상 동작하므로, 배너만 걷어내면 된다.
 */
export function ProfileView({ linkPending, errorCode, errorDescription }: ProfileViewProps) {
  const user = useSessionStore((s) => s.user);
  const profile = useProfileQuery(user?.id);
  const updateNickname = useUpdateNickname(user?.id);
  const updateAvatar = useUpdateAvatar(user?.id);
  const toast = useToast();

  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 조회 결과를 입력창에 반영한다.
   *
   * ⚠ **사용자가 편집 중일 때만 덮지 않는다.** 전에는 "최초 1회만 동기화"였는데, 그러면
   *   다른 탭에서 닉네임을 바꿨을 때 이 탭의 입력창은 옛 값인 채 **저장 버튼만 저절로
   *   활성화**되고(활성 조건이 `nickname !== 서버값`이다), 그걸 누르면 방금 한 변경이
   *   조용히 되돌아갔다.
   * ⚠ userId를 함께 기억한다 — 계정이 바뀌면 이전 사용자의 닉네임이 남으면 안 된다.
   */
  const syncedRef = useRef<{ userId: string; serverValue: string } | null>(null);
  useEffect(() => {
    const serverValue = profile.data?.nickname;
    if (!user?.id || serverValue === undefined) return;

    const synced = syncedRef.current;
    const isSameUser = synced?.userId === user.id;
    // 사용자가 마지막 동기화 값에서 손을 댔다면 그 편집을 지킨다
    const isEditing = isSameUser && nickname !== synced.serverValue;
    if (isSameUser && synced.serverValue === serverValue) return;
    if (isEditing) {
      // 서버 값만 갱신해 둔다 — 다음 비교의 기준이 된다
      syncedRef.current = { userId: user.id, serverValue };
      return;
    }
    syncedRef.current = { userId: user.id, serverValue };
    setNickname(serverValue);
  }, [profile.data?.nickname, user?.id, nickname]);

  const handleNicknameSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 닉네임 UPDATE는 멱등이라 연타해도 행이 늘지 않는다 → 동기 가드가 필요 없다.
    // (data-and-state.md의 기준: "되돌릴 수 없는 결과가 남는가")
    if (updateNickname.isPending) return;

    const message = validateNickname(nickname);
    if (message) {
      setNicknameError(message);
      return;
    }
    setNicknameError(undefined);

    /**
     * ⚠ 호출부 `onSuccess`는 훅의 무효화 Promise가 **끝난 뒤에야** 실행된다(data-and-state.md).
     *   그 사이 사용자가 이어서 입력했을 수 있으므로, 제출 시점 값과 달라졌으면 덮지 않는다.
     *   선례: `comment-bar.tsx`가 같은 방식으로 입력 손실을 막는다.
     */
    const submitted = nickname;
    updateNickname.mutate(nickname, {
      onSuccess: (saved) => {
        // 서버(정규화 트리거)가 확정한 값으로 맞추되, 사용자가 그새 고쳤으면 그대로 둔다
        setNickname((current) => (current === submitted ? saved : current));
        toast("닉네임을 바꿨어요");
      },
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // ⚠ 같은 파일을 다시 골라도 change가 나도록 값을 비운다
    e.target.value = "";
    // 파일 선택 대화상자가 모달이라 같은 tick에 두 번 들어올 수 없다 → 동기 가드가 필요 없다
    if (!file || updateAvatar.isPending) return;

    updateAvatar.mutate(file, { onSuccess: () => toast("프로필 사진을 바꿨어요") });
  };

  const header = <SubHeader title="프로필" fallbackHref={ROUTES.postList} />;
  const linkError = errorCode ? toLinkErrorMessage(errorCode, errorDescription) : null;

  if (profile.isPending) {
    return (
      <>
        {header}
        <main className="flex flex-col gap-4 px-5 py-8">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="h-[50px] w-full" />
        </main>
      </>
    );
  }

  // 캐시가 있으면 화면을 유지하고 배너로만 알린다(목록·상세와 같은 규약)
  if (profile.error && !profile.data) {
    return (
      <>
        {header}
        <main>
          <EmptyState
            live
            title="프로필을 불러오지 못했어요"
            description={profile.error.message}
            onRetry={() => void profile.refetch()}
          />
        </main>
      </>
    );
  }

  if (!profile.data) {
    return (
      <>
        {header}
        <main>
          <EmptyState title="프로필을 찾을 수 없어요" description="다시 로그인해 주세요." />
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="h-full overflow-y-auto pb-10">
        <h1 className="sr-only">프로필</h1>

        {/* 계정 연결에서 돌아왔다 — 프로바이더가 거부했으면 사유를, 교환 중이면 진행 상태를 알린다 */}
        {linkError && (
          <p
            role="alert"
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[13px] leading-[1.5] text-crimson"
          >
            {linkError}
          </p>
        )}
        {!linkError && linkPending && (
          <p
            role="status"
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
          >
            계정을 연결하는 중이에요…
          </p>
        )}

        {profile.error && (
          <p
            role="status"
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
              onClick={() => fileInputRef.current?.click()}
              disabled={updateAvatar.isPending}
              aria-label="프로필 사진 바꾸기"
              className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border border-hairline-cool bg-canvas text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft disabled:opacity-40"
            >
              <Icon as={Camera} size={16} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={handleFileChange}
            className="sr-only"
          />
          <p className="mt-3 text-[12px] text-ink-faint">
            {updateAvatar.isPending ? "올리는 중…" : "JPG · PNG · WebP"}
          </p>
          {updateAvatar.error && (
            <p role="alert" className="mt-2 text-center text-[13px] text-crimson">
              {updateAvatar.error.message}
            </p>
          )}
        </section>

        {/* 닉네임 */}
        <form onSubmit={handleNicknameSubmit} className="flex flex-col gap-3 px-5 pt-8">
          <TextField
            label="닉네임"
            name="nickname"
            value={nickname}
            error={nicknameError ?? updateNickname.error?.message}
            hint={`${NICKNAME_MAX}자까지 · 다른 사람과 같을 수 없어요`}
            onChange={(e) => {
              setNickname(e.target.value);
              setNicknameError(undefined);
            }}
          />
          <Button
            type="submit"
            block
            disabled={updateNickname.isPending || nickname === profile.data.nickname}
          >
            {updateNickname.isPending ? "저장 중…" : "닉네임 저장"}
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
    </>
  );
}
