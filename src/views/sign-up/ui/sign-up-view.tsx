"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { ROUTES, withNext } from "@/shared/config";
import { useNextParam } from "@/shared/lib";
import { Button, TextField } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useSignUp } from "@/features/sign-up";

/** config.toml의 minimum_password_length와 맞춘다 — 어긋나면 클라 통과 후 서버가 weak_password로 막는다 */
const MIN_PASSWORD_LENGTH = 6;

export function SignUpView() {
  const signUp = useSignUp();
  // 인증 화면끼리 이동해도 목적지를 잃지 않도록 next를 이어 붙인다
  const next = useNextParam();
  const [email, setEmail] = useState("");
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

    // ⚠ 로그인과 같은 이유로 여기서 이동시키지 않는다 — 세션이 생기면 GuestOnly가 목적지를 정한다.
    signUp.mutate({ email, password });
  };

  // 이메일 확인이 켜진 프로젝트에서는 세션이 없어 GuestOnly가 움직이지 않는다.
  // 이 화면이 없으면 가입 버튼을 눌러도 폼 그대로라 실패한 것처럼 보인다.
  if (signUp.data?.needsEmailConfirm) {
    return (
      <AuthShell
        title="메일을 보냈어요"
        description={`${email}로 인증 링크를 보냈습니다. 메일함을 확인해 주세요.`}
        footer={
          <Link
            href={withNext(ROUTES.signIn, next)}
            className="font-medium text-ink underline underline-offset-2"
          >
            로그인으로 돌아가기
          </Link>
        }
      >
        <p className="rounded-sm border border-hairline bg-canvas-soft px-4 py-3 text-[13px] leading-[1.6] text-ink-mute">
          링크를 눌러 인증을 마치면 로그인할 수 있어요.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="회원가입"
      description={`이메일과 비밀번호(${MIN_PASSWORD_LENGTH}자 이상)만 있으면 됩니다.`}
      footer={
        <>
          이미 계정이 있나요?{" "}
          <Link
            href={withNext(ROUTES.signIn, next)}
            className="font-medium text-ink underline underline-offset-2"
          >
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label="이메일"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="비밀번호"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`${MIN_PASSWORD_LENGTH}자 이상`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="비밀번호 확인"
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

        {signUp.error && (
          <p role="alert" className="text-[13px] leading-[1.5] text-crimson">
            {signUp.error.message}
          </p>
        )}

        <Button type="submit" block disabled={signUp.isPending} className="mt-2">
          {signUp.isPending ? "가입 중…" : "가입하기"}
        </Button>
      </form>
    </AuthShell>
  );
}
