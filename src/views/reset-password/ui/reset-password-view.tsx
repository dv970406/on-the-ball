"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailWarning } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Button, EmptyState, Skeleton, TextField, buttonClassName } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useSessionStore } from "@/entities/session";
import { useUpdatePassword } from "@/features/update-password";

const MIN_PASSWORD_LENGTH = 6;

/**
 * 새 비밀번호 입력 화면.
 *
 * 메일 링크(?code=)를 타고 들어오면 createBrowserClient의 detectSessionInUrl이
 * 코드를 자동 교환해 세션을 만든다. 그 결과가 스토어에 반영될 때까지 폼을 그리지 않는다 —
 * status로 세 갈래로 나뉜다:
 *   loading       → 교환 진행 중. 스켈레톤.
 *   guest         → 교환 실패(만료·다른 브라우저). 다시 요청하도록 안내.
 *   authenticated → 폼.
 *
 * ⚠ GuestOnly로 감싸면 안 된다 — 이 화면은 세션이 있는 상태로 도달하는 게 정상이다.
 */
export function ResetPasswordView() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const updatePassword = useUpdatePassword();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string>();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password !== passwordConfirm) {
      setConfirmError("비밀번호가 서로 달라요.");
      return;
    }
    setConfirmError(undefined);

    updatePassword.mutate(password, {
      onSuccess: () => router.replace(ROUTES.postList),
    });
  };

  if (status === "loading") {
    return (
      <AuthShell title="비밀번호 재설정" description="링크를 확인하고 있어요.">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AuthShell>
    );
  }

  if (status === "guest") {
    return (
      <AuthShell
        title="링크를 확인할 수 없어요"
        description="만료되었거나, 재설정을 요청한 브라우저가 아닐 수 있어요."
      >
        <EmptyState
          icon={MailWarning}
          title="다시 요청해 주세요"
          description="비밀번호 찾기부터 다시 진행하면 새 링크를 받을 수 있어요."
          // Link 안에 Button을 넣으면 <a> 안에 <button>이라 잘못된 마크업이 된다 →
          // 순수 함수인 buttonClassName으로 링크에 같은 외형만 입힌다
          action={
            <Link href={ROUTES.forgetPassword} className={buttonClassName({ size: "sm" })}>
              비밀번호 찾기로 이동
            </Link>
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="새 비밀번호 설정" description={`${MIN_PASSWORD_LENGTH}자 이상으로 입력해 주세요.`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="새 비밀번호"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          error={confirmError}
          value={passwordConfirm}
          onChange={(e) => {
            setPasswordConfirm(e.target.value);
            setConfirmError(undefined);
          }}
        />

        {updatePassword.error && (
          <p role="alert" className="text-[13px] leading-[1.5] text-crimson">
            {updatePassword.error.message}
          </p>
        )}

        <Button type="submit" block disabled={updatePassword.isPending} className="mt-2">
          {updatePassword.isPending ? "저장 중…" : "비밀번호 변경"}
        </Button>
      </form>
    </AuthShell>
  );
}
