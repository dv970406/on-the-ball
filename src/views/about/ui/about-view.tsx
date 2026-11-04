import Link from "next/link";
import type { ReactNode } from "react";
import { CredibilityMark, StatusBadge } from "@/entities/transfer";
import { ROUTES, env } from "@/shared/config";
import { SiteInfoLinks } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";

/**
 * 서비스 소개 — 무엇을 모으고 어떻게 판정하는지(방법론)를 밝히는 문서 화면.
 *
 * 데이터 서비스의 소개 화면(트랜스퍼마크트·FotMob의 About)처럼 "출처 → 가공 → 한계 → 운영 원칙"의 순서로 쓴다.
 * 보도를 모아 보여 주는 서비스라, 원문에 무엇을 더하는지(딜로 묶기 · 단계 판정 · 공신력 등급 · 한국어 요약)와
 * 원문을 어떻게 다루는지(링크 · 짧은 발췌)를 밝히는 것이 이 화면의 일이다.
 *
 * ⚠ 파이프라인을 설명하는 문장은 `docs/conventions/transfer-pipeline.md`의 규칙과 맞아야 한다 — 수집 주기·귀속 판정·요약 방식을
 *   바꾸면 이 화면도 함께 고친다. 단계 뱃지·공신력 표시는 목록과 같은 컴포넌트를 그대로 쓴다(모양이 어긋나지 않는다).
 * ⚠ 상호작용이 없어 `"use client"`를 붙이지 않는다 — 서버가 본문까지 그린다.
 */

const P = "mt-2.5 break-keep text-[14px] leading-[1.75] text-ink-secondary";
const UL = "mt-2.5 flex list-disc flex-col gap-1.5 pl-5 break-keep text-[14px] leading-[1.7] text-ink-secondary marker:text-ink-mute-2";
const LINK = "text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink";

/** 단계 범례 — 진전 순서다. 보드의 "읽는 법" 시트와 같은 단계 대표값을 쓴다(합의 임박은 메디컬로 대표한다) */
const STAGES = [
  { stage: "rumour", text: "구단이 관심을 보인다는 수준의 이적설" },
  { stage: "talks", text: "구단 사이에 제안이 오가거나 협상이 진행 중" },
  { stage: "medical", text: "개인 조건·메디컬·구단 간 합의 중 하나까지 진행" },
  { stage: "here_we_go", text: "합의가 끝난 것으로 전해졌지만 공식 발표 전" },
  { stage: "official", text: "구단이나 선수가 공식 발표" },
  { stage: "collapsed", text: "협상까지 갔지만 깨졌다고 전해짐" },
  { stage: "denied", text: "루머 단계에서 사실이 아니라고 전해짐" },
] as const;

const MOON_LEVELS = [1, 2, 3, 4, 5] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-9">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AboutView() {
  return (
    <>
      <SubHeader title="서비스 소개" fallbackHref={ROUTES.transferList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]">
        <article className="md:mx-auto md:max-w-[720px] md:pt-4">
          <header className="pt-5">
            <h1 className="text-[22px] font-semibold tracking-[-0.6px] text-ink">온더볼은 이런 서비스예요</h1>
            <p className={P}>
              온더볼은 유럽 5대 리그(프리미어리그·라리가·분데스리가·세리에 A·리그 1)의 이적 소식을 한곳에 모아, 선수마다 지금 어디까지
              진행됐는지를 한눈에 볼 수 있게 정리하는 서비스예요. 같은 이적설을 여러 기자와 매체가 조금씩 다르게 전할 때, 그 보도들을
              한 줄로 묶어 흐름을 보여 줘요.
            </p>
          </header>

          <Section id="what" title="무엇을 하나요">
            <ul className={UL}>
              <li>
                <strong className="font-semibold text-ink">보도를 딜로 묶어요.</strong> 한 선수에 대한 보도를 하나의 딜로 모으고, 보도가
                쌓인 순서대로 타임라인을 보여 줘요.
              </li>
              <li>
                <strong className="font-semibold text-ink">단계를 정해요.</strong> 보도 내용을 바탕으로 루머부터 오피셜까지 지금 어느 단계인지
                판정해요.
              </li>
              <li>
                <strong className="font-semibold text-ink">출처의 공신력을 보여 줘요.</strong> 보도마다 그 기자·매체가 얼마나 믿을 만한지
                표시해요.
              </li>
              <li>
                <strong className="font-semibold text-ink">한국어로 요약해요.</strong> 해외 보도의 요점을 두 문장 안팎의 한국어로 옮겨요.
              </li>
              <li>
                <strong className="font-semibold text-ink">팬이 함께 참여해요.</strong> 관심 있는 딜을 담아 소식을 알림으로 받고, 댓글을
                남기고, 이번 이적 창 안에 성사될지 예측해{" "}
                <Link href={ROUTES.ranking} prefetch={false} className={LINK}>
                  예측 랭킹
                </Link>
                에 오를 수 있어요.
              </li>
            </ul>
          </Section>

          <Section id="sources" title="소식은 어디서 오나요">
            <p className={P}>
              해외 축구 매체의 공개 뉴스 피드와 이적 전문 기자들이 공개적으로 올린 게시물을 매시간 모아요. 누가 쓴 글인지 확인할 수 있는
              보도만 저장하고, 작성자를 알 수 없는 글은 싣지 않아요. 다른 매체의 보도를 옮겨 적은 글은 원래 보도한 매체의 이름으로 표시해요.
            </p>
          </Section>

          <Section id="stages" title="단계는 이렇게 읽어요">
            <p className={P}>
              오피셜을 빼면 모든 단계는 보도를 기준으로 한 판단이라 새 보도가 나오면 바뀔 수 있어요.
            </p>
            <ul className="mt-3.5 flex flex-col gap-3">
              {STAGES.map(({ stage, text }) => (
                <li key={stage} className="flex items-start gap-3">
                  <span className="flex w-[72px] shrink-0 justify-start pt-px">
                    <StatusBadge stage={stage} />
                  </span>
                  <p className="min-w-0 flex-1 break-keep text-[14px] leading-[1.5] text-ink-secondary">{text}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="credibility" title="출처의 공신력">
            <p className={P}>
              기자와 매체가 이적 보도에서 쌓아 온 평판을 바탕으로 온더볼이 직접 등급을 매겨요. 공식 발표에 가까울 만큼 믿을 만한 매체에는
              메달을, 그 밖의 기자·매체에는 다섯 단계의 달을 붙여요. 다른 매체의 보도를 옮겨 적은 가십 칼럼은 원래 보도한 매체의 등급을
              따르되 메달은 붙이지 않아요. 등급은 보도가 사실이라는 보증이 아니라 읽는 데 참고할 신호예요.
            </p>
            <ul className="mt-3.5 flex flex-col gap-3">
              <li className="flex items-start gap-3">
                <span className="flex w-[72px] shrink-0 justify-start">
                  <CredibilityMark value={{ kind: "medal" }} />
                </span>
                <p className="min-w-0 flex-1 break-keep text-[14px] leading-[1.5] text-ink-secondary">
                  오피셜에 가까울 만큼 믿을 만한 매체
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex w-[72px] shrink-0 items-center justify-start">
                  {MOON_LEVELS.map((level) => (
                    <CredibilityMark key={level} value={{ kind: "moon", level }} />
                  ))}
                </span>
                <p className="min-w-0 flex-1 break-keep text-[14px] leading-[1.5] text-ink-secondary">
                  달이 찰수록 믿을 만한 기자·매체. 표시가 없으면 아직 평가하지 않은 출처예요.
                </p>
              </li>
            </ul>
          </Section>

          <Section id="ai" title="AI를 이렇게 써요">
            <p className={P}>
              보도마다 그 글이 실제 이적 움직임을 말하는지, 어느 단계를 가리키는지 판단하고 한국어 요약을 만드는 데 언어 모델(AI)을 써요.
              AI의 판단은 틀릴 수 있어요. 그래서 모든 보도에 원문 링크를 함께 달아 직접 확인할 수 있게 하고, 잘못된 판정을 발견하면 규칙을
              고쳐 다시 판정해요.
            </p>
          </Section>

          <Section id="principles" title="원문과 저작권">
            <ul className={UL}>
              <li>보도 전문을 옮겨 싣지 않아요. 짧은 발췌와 요약, 그리고 원문으로 가는 링크만 보여 줘요.</li>
              <li>보도의 출처(기자·매체)를 항상 함께 표시해요.</li>
              <li>구단 엠블럼과 이름의 권리는 각 구단에 있어요. 온더볼은 구단·리그와 제휴하지 않은 독립 서비스예요.</li>
              <li>권리자가 게시 중단을 요청하면 확인 후 바로 내려요.</li>
            </ul>
          </Section>

          <Section id="caution" title="이용할 때 알아 두세요">
            <p className={P}>
              온더볼의 정보는 공개된 보도를 정리한 것으로, 구단의 공식 입장이 아니에요. 이적의 사실 여부는 구단의 공식 발표로 확인해 주세요.
              성사 예측은 재미로 하는 참여 기능이며 돈이나 경품이 걸려 있지 않아요.
            </p>
          </Section>

          <Section id="contact" title="문의">
            <p className={P}>
              서비스에 대한 의견, 잘못된 정보 신고, 게시 중단 요청은{" "}
              {env.contactEmail ? (
                <a href={`mailto:${env.contactEmail}`} className={LINK}>
                  {env.contactEmail}
                </a>
              ) : (
                "준비 중인 연락처"
              )}
              로 보내 주세요. 개인정보 처리에 관한 내용은{" "}
              <Link href={ROUTES.privacy} prefetch={false} className={LINK}>
                개인정보처리방침
              </Link>
              에서 확인할 수 있어요.
            </p>
          </Section>

          <SiteInfoLinks className="mt-10 border-t border-hairline pt-2" />
        </article>
      </main>
    </>
  );
}
