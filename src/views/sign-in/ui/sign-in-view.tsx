"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ROUTES, withNext } from "@/shared/config";
import { useNextParam } from "@/shared/lib";
import { Button, TextField } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useSignIn } from "@/features/sign-in";

export function SignInView() {
  const signIn = useSignIn();
  // 인증 화면끼리 이동해도 목적지를 잃지 않도록 next를 이어 붙인다
  const next = useNextParam();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ⚠ 성공 후 이동을 여기서 하지 않는다. supabase가 signInWithPassword 반환 전에
  //   SIGNED_IN을 발행 → GuestOnly가 이 컴포넌트를 언마운트하므로 onSuccess가
  //   실행되지 않는다. 목적지(?next= 포함) 결정은 GuestOnly가 단독으로 맡는다.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    signIn.mutate({ email, password });
  };

  return (
    <AuthShell
      title="로그인"
      description="댓글과 좋아요를 남기려면 로그인이 필요해요."
      footer={
        <>
          아직 계정이 없나요?{" "}
          <Link
            href={withNext(ROUTES.signUp, next)}
            className="font-medium text-ink underline underline-offset-2"
          >
            회원가입
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* 훅이 이미 한국어로 바꿔 던진 메시지 — 컴포넌트는 노출만 한다 */}
        {signIn.error && (
          <p role="alert" className="text-[13px] leading-[1.5] text-crimson">
            {signIn.error.message}
          </p>
        )}

        <Button type="submit" block disabled={signIn.isPending} className="mt-2">
          {signIn.isPending ? "로그인 중…" : "로그인"}
        </Button>

        <Link
          href={withNext(ROUTES.forgetPassword, next)}
          className="self-center text-[13px] text-ink-mute underline underline-offset-2"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </form>
    </AuthShell>
  );
}
