"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOAuthSignIn } from "@/features/sign-in";
import { OAUTH_PROVIDERS, ROUTES } from "@/shared/config";
import { useNextParam } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import { AuthShell } from "@/widgets/auth-shell";
import { ProviderButton } from "./provider-button";

/**
 * 코드 교환(네트워크 왕복 1회)을 기다릴 최대 시간.
 * ⚠ 상한이 **반드시 필요하다.** supabase는 교환에 실패해도 조용히 빠져나가므로
 *   (auth-js `_initialize`가 에러를 디버그 로그로만 남긴다) 앱이 실패를 알 방법이 이것뿐이다.
 */
const EXCHANGE_TIMEOUT_MS = 8000;

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
 * 프로바이더가 실패를 돌려준 경우의 문구.
 * ⚠ 원문은 영어다. 사용자가 동의를 취소한 경우(access_denied)가 대부분이라 그것만 따로 옮기고,
 *   나머지는 원문을 함께 보여준다 — 삼키면 지원 문의에 아무 단서도 남지 않는다.
 */
function toOAuthErrorMessage(code: string, description: string | null): string {
	if (code === "access_denied") return "로그인을 취소했어요.";
	return description
		? `로그인하지 못했어요. (${description})`
		: "로그인하지 못했어요.";
}

/**
 * 소셜 로그인 화면. **로그인과 가입이 같은 동작**이라 가입 화면을 따로 두지 않는다.
 *
 * ⚠ 성공 후 이동을 여기서 하지 않는다 — 세션이 생기면 `GuestOnly`가 `?next=`를 읽어 목적지를
 *   정한다(data-and-state.md). 이 화면은 시작과 실패만 책임진다.
 */
export function SignInView({
	hasCode,
	canExchange,
	errorCode,
	errorDescription,
}: SignInViewProps) {
	// 인증 화면 진입 시 실린 목적지를 OAuth 왕복 너머까지 이어 붙인다.
	// ⚠ 이 값은 **렌더에 쓰이지 않는다**(클릭 시 redirectTo를 만들 때만 쓴다) → 서버/클라 차이가
	//   화면에 드러나지 않아 hasCode와 달리 서버에서 내려받을 이유가 없다.
	const next = useNextParam();
	const oauth = useOAuthSignIn(next);

	/**
	 * 교환을 기다리는 시간의 상한.
	 *
	 * ⚠ 상한이 **반드시 필요하다.** supabase는 교환에 실패해도 조용히 빠져나가므로
	 *   (auth-js `_initialize`가 에러를 디버그 로그로만 남긴다) 앱이 실패를 알 방법이 이것뿐이다.
	 * ⚠ 교환이 **시작조차 될 수 없는** 경우(verifier 없음)는 서버가 이미 판정해 내려주므로
	 *   여기서 상한을 기다리지 않는다 — 그 8초는 통째로 버리는 시간이었다.
	 */
	const [exchangeTimedOut, setExchangeTimedOut] = useState(false);
	useEffect(() => {
		if (!hasCode || !canExchange) return;
		const timer = setTimeout(
			() => setExchangeTimedOut(true),
			EXCHANGE_TIMEOUT_MS,
		);
		return () => clearTimeout(timer);
	}, [hasCode, canExchange]);

	/**
	 * ⚠ **`hasCode`가 반드시 앞에 와야 한다.** `canExchange`는 PKCE verifier 쿠키 유무인데,
	 *   OAuth를 시작한 적 없는 브라우저에는 그 쿠키가 아예 없다(교환 후에도 삭제된다).
	 *   그래서 `!canExchange`만 보면 **첫 방문·로그아웃 후 재방문·`?next=` 진입 전부**
	 *   "로그인을 마치지 못했어요"가 떴다. 실패는 **코드를 들고 돌아왔을 때만** 성립한다.
	 */
	const exchangeFailed = hasCode && (!canExchange || exchangeTimedOut);

	// 코드를 들고 돌아왔다면 교환 결과가 반영될 때까지 기다린다 — 단 무한정은 아니다.
	// (성공하면 GuestOnly가 이 화면을 걷어내므로 여기서 끝을 볼 일이 없다)
	if (hasCode && !exchangeFailed) {
		return (
			<AuthShell title="로그인 중" description="잠시만 기다려 주세요.">
				<div className="flex flex-col gap-3">
					<Skeleton className="h-[50px] w-full" />
					<Skeleton className="h-[50px] w-full" />
				</div>
			</AuthShell>
		);
	}

	const errorMessage =
		(errorCode ? toOAuthErrorMessage(errorCode, errorDescription) : null) ??
		(exchangeFailed ? "로그인을 마치지 못했어요. 다시 시도해 주세요." : null) ??
		oauth.error?.message ??
		null;

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
			<div className="flex flex-col gap-2.5">
				{OAUTH_PROVIDERS.map((provider) => (
					<ProviderButton
						key={provider}
						provider={provider}
						// 이동이 시작될 때까지의 시각 표시 — 실제 연타 차단은 훅의 동기 가드가 한다
						disabled={oauth.isPending}
						onClick={() => oauth.start(provider)}
					/>
				))}
			</div>

			{errorMessage && (
				<p
					role="alert"
					className="mt-4 text-center text-[13px] leading-[1.5] text-crimson"
				>
					{errorMessage}
				</p>
			)}
		</AuthShell>
	);
}
