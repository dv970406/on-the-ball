"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailWarning } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Button, EmptyState, Skeleton, TextField, buttonClassName } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useSessionStore } from "@/entities/session";
import { useUpdatePassword } from "@/features/update-password";

const MIN_PASSWORD_LENGTH = 6;

/** 링크의 코드 교환(네트워크 왕복 1회)을 기다릴 최대 시간 */
const EXCHANGE_TIMEOUT_MS = 6000;

/**
 * 새 비밀번호 입력 화면.
 *
 * 메일 링크(?code=)를 타고 들어오면 createBrowserClient의 detectSessionInUrl이
 * 코드를 자동 교환해 세션을 만든다. 그 결과가 스토어에 반영될 때까지 폼을 그리지 않는다.
 *
 * ⚠ GuestOnly로 감싸면 안 된다 — 이 화면은 세션이 있는 상태로 도달하는 게 정상이다.
 *
 * ⚠⚠ **로그인 세션이 있다는 것만으로 폼을 열지 않는다.**
 *   이 화면은 기존 비밀번호를 묻지 않으므로, 아무 세션에나 열어주면 잠깐 남의 브라우저를
 *   만진 사람이 계정을 영구히 탈취할 수 있다. config.toml의 `secure_password_change`는
 *   이걸 막아주지 못한다 — GoTrue는 **세션 생성 후 24시간이 지난 경우에만** 재인증을
 *   요구한다(실측: 갓 만든 세션 200, created_at을 2일 전으로 민 세션 400 reauthentication_needed).
 *   → 복구 링크로 확립된 세션(`PASSWORD_RECOVERY` 이벤트)에만 폼을 연다.
 */
export function ResetPasswordView() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const isPasswordRecovery = useSessionStore((s) => s.isPasswordRecovery);
  const updatePassword = useUpdatePassword();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string>();

  /**
   * 메일 링크를 타고 들어왔는지 — 첫 렌더에서 붙잡는다.
   *
   * ⚠ 타이밍이 중요하다. supabase 클라이언트는 AuthProvider의 **effect**에서 처음 생성되고,
   *   effect는 자식 렌더가 모두 끝난 뒤에 돈다. 그래서 이 초기화 함수가 도는 시점에는
   *   detectSessionInUrl이 아직 URL을 정리하기 전이라 `code`가 그대로 남아 있다.
   *
   * 이 값이 필요한 이유: 링크로 들어온 경우 코드 교환이 끝나기 전까지는
   * "authenticated인데 복구 세션이 아닌" 중간 상태가 잠깐 존재한다. 그 순간을
   * "직접 진입"으로 오판해 안내 화면을 깜빡이지 않도록, 링크 진입은 스켈레톤으로 기다린다.
   */
  const [arrivedFromLink] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("code"),
  );

  /**
   * 코드 교환을 기다리는 시간의 상한.
   *
   * ⚠ 상한이 **반드시 필요하다.** supabase는 교환에 실패해도 기존 세션을 지우지 않고
   *   조용히 빠져나간다(auth-js 2.110 `_initialize`의 "Don't remove existing session on
   *   URL login failure"). 그러면 `PASSWORD_RECOVERY`는 영영 오지 않는데 세션은 살아 있어
   *   `authenticated + !isPasswordRecovery + arrivedFromLink` 조건이 **영구히 참**이 된다.
   *   실제로 링크 재클릭·만료 링크·메일 스캐너가 먼저 소비한 링크·다른 브라우저에서 요청한
   *   링크가 전부 이 경우이고, 그 상태의 화면에는 링크도 버튼도 없어 빠져나갈 수단이 없었다.
   */
  const [exchangeTimedOut, setExchangeTimedOut] = useState(false);
  useEffect(() => {
    if (!arrivedFromLink || isPasswordRecovery) return;
    const timer = setTimeout(() => setExchangeTimedOut(true), EXCHANGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [arrivedFromLink, isPasswordRecovery]);

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

  // 링크로 들어왔다면 코드 교환 결과가 반영될 때까지 기다린다 — 단 무한정은 아니다
  const awaitingExchange =
    arrivedFromLink && !isPasswordRecovery && status === "authenticated" && !exchangeTimedOut;

  /**
   * ⚠ **변경에 성공한 뒤에는 아래 안내 분기로 내려가면 안 된다.**
   *   supabase가 updateUser 성공과 함께 `USER_UPDATED`를 발행하고, 스토어는 설계대로
   *   `isPasswordRecovery`를 내린다(session-store 주석 — 공용 PC에서 두 번 바꾸는 걸 막는 장치).
   *   그러면 목록으로 이동(RSC 왕복)이 끝나기 전에 `!isPasswordRecovery` 분기가 열려
   *   **성공한 사용자에게 "재설정 링크가 필요해요"가 노출된다.**
   *   이동이 끝나 이 화면이 언마운트될 때까지 대기 화면을 유지한다.
   */
  if (status === "loading" || awaitingExchange || updatePassword.isSuccess) {
    return (
      <AuthShell
        title={updatePassword.isSuccess ? "비밀번호를 바꿨어요" : "비밀번호 재설정"}
        description={
          updatePassword.isSuccess ? "잠시 후 이동할게요." : "링크를 확인하고 있어요."
        }
      >
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AuthShell>
    );
  }

  // 로그인 상태로 이 주소에 직접 들어온 경우 — 기존 비밀번호 없이 바꾸게 두지 않는다
  if (!isPasswordRecovery) {
    return (
      <AuthShell
        title={status === "guest" ? "링크를 확인할 수 없어요" : "재설정 링크가 필요해요"}
        description={
          status === "guest"
            ? "만료되었거나, 재설정을 요청한 브라우저가 아닐 수 있어요."
            : "보안을 위해 메일로 받은 재설정 링크를 통해서만 비밀번호를 바꿀 수 있어요."
        }
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
