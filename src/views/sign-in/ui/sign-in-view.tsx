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
      // 서비스 이름과 한 줄 소개만 — 인증 화면은 로그인이라는 목적 하나만 드러낸다
      title="온더볼"
      description="모든 축구팬들을 위한 커뮤니티."
      // 게스트 진입 — 로그인 없이 목록을 둘러본다(읽기는 RLS가 공개로 허용한다).
      // ⚠ 약관 동의 고지는 여기 두지 않는다 — 동의를 받는 시점은 가입이고,
      //   링크할 /terms·/privacy도 아직 없다. 문서가 생기면 회원가입 화면에 링크와 함께 넣는다.
      belowForm={
        <div className="mt-4 text-center">
          <Link
            href={ROUTES.postList}
            className="text-[13px] font-medium text-ink-mute underline decoration-hairline-strong underline-offset-[3px]"
          >
            먼저 둘러볼게요
          </Link>
        </div>
      }
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
