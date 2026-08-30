"use client";

import Link from "next/link";
import { OAUTH_PROVIDERS, ROUTES } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { useSignInFlow } from "../model/use-sign-in-flow";
import { ProviderButton } from "./provider-button";

interface SignInViewProps {
	/** 프로바이더에서 `?code=`를 들고 돌아왔는지 — 서버가 판정해 내려준다(page.tsx 주석 참고) */
	hasCode: boolean;
	/** PKCE verifier가 남아 있는지. false면 교환이 성립할 수 없으므로 기다리지 않는다 */
	canExchange: boolean;
	/** 프로바이더가 거부한 경우 (`?error=`) */
	errorCode: string | null;
	errorDescription: string | null;
}

/**
 * 소셜 로그인 화면. **로그인과 가입이 같은 동작**이라 가입 화면을 따로 두지 않는다.
 *
 * 시작·대기·실패 판정은 전부 `use-sign-in-flow`가 갖는다.
 */
export function SignInView({
	hasCode,
	canExchange,
	errorCode,
	errorDescription,
}: SignInViewProps) {
	const flow = useSignInFlow(hasCode, canExchange, errorCode, errorDescription);

	if (flow.waiting) {
		return (
			<AuthShell title="로그인 중" description="잠시만 기다려 주세요.">
				<div className="flex flex-col gap-3">
					<Skeleton className="h-[50px] w-full" />
					<Skeleton className="h-[50px] w-full" />
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			// 서비스 이름과 한 줄 소개만 — 인증 화면은 로그인이라는 목적 하나만 드러낸다
			title="온더볼"
			description="모든 축구팬들을 위한 커뮤니티."
			// 게스트 진입 — 로그인 없이 목록을 둘러본다(읽기는 RLS가 공개로 허용한다)
			belowForm={
				<div className="mt-5 text-center">
					<Link
						href={ROUTES.postList}
						className="text-[13px] font-medium text-ink-mute underline decoration-hairline-strong underline-offset-[3px]"
					>
						먼저 둘러볼게요
					</Link>
				</div>
			}
		>
			{/* ⚠ gap이 2.5(10px)가 아니라 3.5(14px)인 이유: "최근 사용" 배지가 버튼 위로 8px
			    걸쳐 올라온다 — 10px이면 위 버튼과 2px까지 붙어 배지가 끼인 것처럼 보인다 */}
			<div className="flex flex-col gap-3.5">
				{OAUTH_PROVIDERS.map((provider) => (
					<ProviderButton
						key={provider}
						provider={provider}
						recent={provider === flow.lastProvider}
						disabled={flow.isPending}
						onClick={() => flow.start(provider)}
					/>
				))}
			</div>

			{flow.errorMessage && (
				<p className="mt-4 text-center text-[13px] leading-[1.5] text-crimson">
					{flow.errorMessage}
				</p>
			)}
		</AuthShell>
	);
}
