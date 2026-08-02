"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ROUTES, withNext } from "@/shared/config";
import { useNextParam } from "@/shared/lib";
import { Button, TextField } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useRequestPasswordReset } from "@/features/request-password-reset";

export function ForgetPasswordView() {
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState("");
  // 인증 화면끼리 이동해도 목적지를 잃지 않도록 next를 이어 붙인다 —
  // 여기서 끊기면 "글쓰기 → 로그인 → 비밀번호 찾기 → 로그인" 경로에서 목적지가 사라진다
  const next = useNextParam();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    requestReset.mutate(email);
  };

  if (requestReset.isSuccess) {
    return (
      <AuthShell
        title="메일을 보냈어요"
        description={`${email}로 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.`}
        footer={
          <Link href={withNext(ROUTES.signIn, next)} className="font-medium text-ink underline underline-offset-2">
            로그인으로 돌아가기
          </Link>
        }
      >
        {/* PKCE 흐름이라 code_verifier가 이 브라우저에만 저장된다 — 안내가 필요한 지점 */}
        <p className="rounded-sm border border-hairline bg-canvas-soft px-4 py-3 text-[13px] leading-[1.6] text-ink-mute">
          링크는 <span className="font-medium text-ink">지금 이 브라우저</span>에서 열어야 해요.
          다른 기기나 시크릿 창에서 열면 인증에 실패합니다.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="비밀번호 찾기"
      description="가입한 이메일로 재설정 링크를 보내드릴게요."
      footer={
        <Link href={withNext(ROUTES.signIn, next)} className="font-medium text-ink underline underline-offset-2">
          로그인으로 돌아가기
        </Link>
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

        {requestReset.error && (
          <p role="alert" className="text-[13px] leading-[1.5] text-crimson">
            {requestReset.error.message}
          </p>
        )}

        <Button type="submit" block disabled={requestReset.isPending} className="mt-2">
          {requestReset.isPending ? "보내는 중…" : "재설정 링크 보내기"}
        </Button>
      </form>
    </AuthShell>
  );
}
