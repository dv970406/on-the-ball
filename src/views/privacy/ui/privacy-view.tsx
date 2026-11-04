import type { ReactNode } from "react";
import { ROUTES, env } from "@/shared/config";
import { SiteInfoLinks } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";

/**
 * 개인정보처리방침 — 「개인정보 보호법」 제30조의 기재 사항을 개인정보보호위원회 "개인정보 처리방침 작성지침"의 항목 순서로 적는다
 * (국내 대형 서비스의 방침과 같은 골격: 목차 → 항목 → 위탁·국외 이전 → 권리 → 안전조치 → 쿠키 → 행태정보 → 책임자 → 구제 → 변경).
 *
 * ⚠ **실제로 수집하는 것만 적는다** — 항목은 코드에서 확인한 것이다(소셜 로그인이 보내는 정보 · `profiles` · 관심 · 응원 구단 ·
 *   댓글·표 · 예측 · 푸시 구독 · 쿠키 · 브라우저 저장소). 수집 항목·위탁사가 바뀌는 작업(새 테이블 · 새 분석 도구 · 새 외부 서비스)을
 *   하면 이 문서도 함께 고치고 시행일을 올린다.
 * ⚠ 상호작용이 없어 `"use client"`를 붙이지 않는다 — 서버가 본문까지 그린다.
 */

/** 시행일 — 내용을 바꾸면 함께 올린다(공지 기간은 아래 "변경" 절) */
const EFFECTIVE_DATE = { iso: "2026-11-03", label: "2026년 11월 3일" };

/** 목차와 본문 제목의 단일 소스 — 앵커(`#…`)도 여기서 나온다 */
const SECTIONS = [
  { id: "items", title: "처리하는 개인정보 항목과 수집 방법" },
  { id: "purpose", title: "개인정보의 처리 목적" },
  { id: "retention", title: "보유·이용 기간과 파기" },
  { id: "third-party", title: "개인정보의 제3자 제공" },
  { id: "outsourcing", title: "처리 위탁과 국외 이전" },
  { id: "rights", title: "이용자의 권리와 행사 방법" },
  { id: "security", title: "안전성 확보 조치" },
  { id: "cookies", title: "쿠키 등 자동 수집 장치" },
  { id: "behavioral", title: "행태정보의 수집·이용과 거부" },
  { id: "children", title: "만 14세 미만 아동" },
  { id: "officer", title: "개인정보 보호책임자" },
  { id: "remedy", title: "권익침해 구제 방법" },
  { id: "changes", title: "처리방침의 변경" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const P = "mt-2.5 break-keep text-[14px] leading-[1.75] text-ink-secondary";
const UL = "mt-2.5 flex list-disc flex-col gap-1.5 pl-5 break-keep text-[14px] leading-[1.7] text-ink-secondary marker:text-ink-mute-2";
const LINK = "break-all text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink";

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const index = SECTIONS.findIndex((s) => s.id === id);
  return (
    <section aria-labelledby={id} className="mt-9">
      {/* 제목의 id가 목차의 앵커다 — 건너왔을 때 제목이 스크롤 영역 맨 위에 붙지 않게 여백을 준다 */}
      <h2 id={id} className="section-title scroll-mt-4">
        {index + 1}. {SECTIONS[index].title}
      </h2>
      {children}
    </section>
  );
}

/** 표 대신 쓰는 항목 묶음 — 좁은 화면에서 열이 많은 표는 가로로 넘친다 */
function Entry({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-hairline px-4 py-3.5">
      <dt className="text-[14px] font-semibold text-ink">{title}</dt>
      <dd className="mt-1.5 break-keep text-[13px] leading-[1.7] text-ink-secondary">{children}</dd>
    </div>
  );
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

function Contact() {
  if (!env.contactEmail) return <span>연락처를 준비하고 있어요.</span>;
  return (
    <a href={`mailto:${env.contactEmail}`} className={LINK}>
      {env.contactEmail}
    </a>
  );
}

export function PrivacyView() {
  return (
    <>
      <SubHeader title="개인정보처리방침" fallbackHref={ROUTES.transferList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))] md:[scrollbar-gutter:stable]">
        <article className="md:mx-auto md:max-w-[720px] md:pt-4">
          <header className="pt-5">
            <h1 className="text-[22px] font-semibold tracking-[-0.6px] text-ink">개인정보처리방침</h1>
            <p className={P}>
              온더볼(이하 ‘서비스’)은 「개인정보 보호법」 제30조에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고
              원활하게 처리하기 위해 다음과 같이 개인정보처리방침을 정하고 공개합니다.
            </p>
            <p className="mt-2 text-[13px] text-ink-mute">
              시행일 <time dateTime={EFFECTIVE_DATE.iso}>{EFFECTIVE_DATE.label}</time>
            </p>
          </header>

          {/* 목차 — 작성지침이 권하는 구성이다. 항목이 길어 원하는 절로 바로 간다 */}
          <nav aria-label="목차" className="mt-6 rounded-md bg-canvas-soft px-4 py-4">
            <p className="text-[13px] font-semibold text-ink">목차</p>
            <ol className="mt-2 flex flex-col gap-1 text-[13px] leading-[1.6]">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-ink-secondary hover:text-ink">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <Section id="items">
            <p className={P}>
              서비스는 회원가입 없이도 이적 소식을 볼 수 있으며, 로그인이 필요한 기능을 쓸 때만 아래 정보를 처리합니다. 비밀번호는
              받지도 저장하지도 않습니다(카카오·Google 계정으로만 로그인합니다).
            </p>
            <dl className="mt-4 flex flex-col gap-2.5">
              <Entry title="로그인할 때 (필수)">
                카카오·Google이 보내는 회원 식별값, 이메일 주소(이용자가 제공에 동의한 경우), 이름·프로필 사진 주소(로그인 서비스가 함께
                보내는 경우). 이름과 프로필 사진 주소는 화면에 쓰지 않습니다. 수집 방법: 이용자가 소셜 로그인에 동의할 때 해당
                서비스로부터 받습니다.
              </Entry>
              <Entry title="서비스를 이용할 때">
                닉네임(가입 시 무작위로 배정되며 직접 바꿀 수 있습니다), 프로필 사진(직접 올린 경우), 관심 목록에 담은 딜, 응원 구단,
                작성한 댓글과 누른 좋아요·싫어요, 딜 성사 예측과 그 점수·순위.
              </Entry>
              <Entry title="알림을 켤 때 (선택)">
                브라우저가 만든 푸시 구독 정보(푸시 서비스 주소, 암호화 키). 이 기기에서 알림을 켠 경우에만 저장합니다.
              </Entry>
              <Entry title="자동으로 생성·수집되는 정보">
                접속 IP 주소, 브라우저·기기 정보, 접속 일시, 서비스 이용 기록, 쿠키, 광고 식별 정보. 이용 통계(Google Analytics)와 광고
                게재(Google AdSense) 과정에서 수집됩니다.
              </Entry>
              <Entry title="이용자의 브라우저에만 저장되는 정보">
                최근에 쓴 로그인 수단, 안내 문구를 본 적이 있는지, 목록의 스크롤 위치, 글꼴을 받아 두었는지. 서버로 보내지 않으며 브라우저의
                사이트 데이터를 지우면 사라집니다.
              </Entry>
            </dl>
          </Section>

          <Section id="purpose">
            <ul className={UL}>
              <li>회원 식별과 로그인 상태 유지</li>
              <li>관심 목록·응원 구단·알림·댓글·성사 예측과 예측 랭킹 등 서비스 기능 제공</li>
              <li>부정 이용 방지와 서비스 안정성 확보</li>
              <li>이용 통계 분석과 서비스 개선</li>
              <li>광고 게재와 광고 성과 측정(이용자의 관심사에 맞춘 광고를 포함합니다 — 9항)</li>
            </ul>
          </Section>

          <Section id="retention">
            <ul className={UL}>
              <li>
                회원 정보와 서비스 이용 중 생성된 정보는 <strong className="font-semibold text-ink">회원 탈퇴 시까지</strong> 보유하고, 탈퇴하면
                지체 없이 파기합니다. 탈퇴하면 작성한 댓글과 표·예측도 함께 삭제되며, 내 댓글에 달린 다른 이용자의 답글도 함께
                삭제됩니다.
              </li>
              <li>푸시 구독 정보는 알림을 끄거나, 로그아웃하거나, 브라우저가 구독을 해지할 때 삭제합니다.</li>
              <li>관계 법령에서 보존하도록 정한 정보는 그 법령이 정한 기간 동안 분리해 보관한 뒤 파기합니다.</li>
              <li>
                탈퇴는 아래 개인정보 보호책임자에게 이메일로 요청할 수 있으며, 본인 확인 후 10일 이내에 처리합니다.
              </li>
              <li>파기는 전자적 파일을 복구할 수 없는 방법으로 삭제하는 방식으로 합니다.</li>
            </ul>
          </Section>

          <Section id="third-party">
            <p className={P}>
              서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 특별한 규정이 있거나 수사기관이 법령에 정한 절차에
              따라 요구하는 경우에는 예외로 합니다.
            </p>
          </Section>

          <Section id="outsourcing">
            <p className={P}>
              서비스는 원활한 운영을 위해 아래 회사에 개인정보 처리를 위탁하고 있으며, 이 회사들은 국외에 있어 개인정보가 국외로
              이전될 수 있습니다. 이전은 이용자가 서비스를 이용하는 시점에 네트워크를 통해 이루어지며, 보유 기간은 회원 탈퇴 또는 위탁
              계약 종료 시까지입니다(Google이 수집하는 정보는 Google의 보관 정책을 따릅니다).
            </p>
            <dl className="mt-4 flex flex-col gap-2.5">
              <Entry title="Supabase Inc. (미국)">
                회원 인증, 데이터베이스와 프로필 사진 저장. 1항의 회원 정보와 이용 중 생성된 정보 전부. 데이터는 대한민국(서울) 리전의
                서버에 저장됩니다.
              </Entry>
              <Entry title="Vercel Inc. (미국)">웹사이트 호스팅과 전송. 접속 IP 주소, 브라우저 정보, 접속 기록.</Entry>
              <Entry title="GitHub, Inc. (미국)">
                이적 소식 알림 발송 작업의 실행. 푸시 구독 정보, 관심 목록과 응원 구단.
              </Entry>
              <Entry title="Google LLC (미국)">
                이용 통계 분석(Google Analytics)과 광고 게재(Google AdSense). 쿠키, 서비스 이용 기록, 기기·브라우저 정보, 광고 식별 정보.
              </Entry>
            </dl>
            <p className={P}>
              알림은 이용자의 브라우저가 정한 푸시 서비스(Google, Apple, Mozilla 등)를 거쳐 전달되며, 알림 내용은 암호화되어 전송됩니다.
            </p>
            <p className={P}>
              국외 이전을 원하지 않으면 로그인하지 않거나 탈퇴할 수 있고, 브라우저에서 쿠키를 차단할 수 있습니다. 이 경우 로그인이 필요한
              기능을 쓸 수 없습니다.
            </p>
          </Section>

          <Section id="rights">
            <p className={P}>
              이용자는 언제든지 자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있습니다. 법정대리인이나 위임을 받은 사람을
              통해서도 할 수 있습니다.
            </p>
            <ul className={UL}>
              <li>프로필 화면에서 닉네임과 프로필 사진을 바꾸고, 로그인 수단 연결을 해제하고, 응원 구단과 알림을 설정할 수 있습니다.</li>
              <li>댓글은 직접 삭제할 수 있고, 관심 목록에서 딜을 뺄 수 있습니다.</li>
              <li>
                그 밖의 열람·삭제(예측 기록 등)와 탈퇴는 개인정보 보호책임자에게 이메일로 요청하면 본인 확인 후 10일 이내에 조치하고 결과를
                알려 드립니다.
              </li>
            </ul>
          </Section>

          <Section id="security">
            <ul className={UL}>
              <li>모든 통신을 HTTPS로 암호화합니다.</li>
              <li>데이터베이스에 행 단위 접근 제어를 적용해, 이용자는 자신의 비공개 정보에만 접근할 수 있습니다.</li>
              <li>비밀번호를 받지 않고, 운영용 접근 키는 서비스 코드와 분리해 보관합니다.</li>
              <li>개인정보에 접근할 수 있는 사람을 운영자로 한정합니다.</li>
            </ul>
          </Section>

          <Section id="cookies">
            <p className={P}>
              쿠키는 웹사이트가 이용자의 브라우저에 저장하는 작은 데이터입니다. 서비스는 다음 목적으로 쿠키를 사용합니다.
            </p>
            <ul className={UL}>
              <li>로그인 유지(필수) — 거부하면 로그인이 필요한 기능을 쓸 수 없습니다.</li>
              <li>이용 통계 분석 — Google Analytics가 방문 페이지와 이용 흐름을 집계합니다.</li>
              <li>광고 — Google AdSense가 광고를 게재하고 성과를 측정합니다(9항).</li>
            </ul>
            <p className={P}>
              이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 저장된 쿠키를 삭제할 수 있습니다(Chrome: 설정 → 개인정보 보호 및 보안 →
              서드파티 쿠키 / Safari: 설정 → 개인정보 보호 / Edge: 설정 → 쿠키 및 사이트 권한). Google Analytics의 수집만 막으려면{" "}
              <External href="https://tools.google.com/dlpage/gaoptout">Google 애널리틱스 차단 브라우저 부가기능</External>을 설치할 수
              있습니다.
            </p>
          </Section>

          <Section id="behavioral">
            <p className={P}>
              서비스는 Google AdSense로 광고를 게재하며, 이 과정에서 Google이 이용자의 관심사에 맞는 광고를 보여 주기 위해 행태정보를
              수집합니다.
            </p>
            <dl className="mt-4 flex flex-col gap-2.5">
              <Entry title="수집하는 행태정보">방문한 페이지, 광고 노출·클릭 기록, 기기·브라우저 정보</Entry>
              <Entry title="수집 방법">이용자가 서비스를 방문할 때 쿠키로 자동 수집</Entry>
              <Entry title="수집 목적">이용자의 관심사에 맞춘 광고 제공과 광고 성과 측정</Entry>
              <Entry title="수집·처리하는 사업자">Google LLC — 보유 기간은 Google의 정책을 따릅니다</Entry>
            </dl>
            <p className={P}>
              맞춤형 광고를 원하지 않으면{" "}
              <External href="https://adssettings.google.com">Google 광고 설정</External>에서 끄거나 브라우저에서 쿠키를 차단할 수
              있습니다. 맞춤형 광고를 꺼도 광고는 표시되지만 관심사와 무관한 광고가 됩니다. Google이 파트너 사이트에서 정보를 어떻게
              사용하는지는{" "}
              <External href="https://policies.google.com/technologies/partner-sites">Google의 안내</External>에서 확인할 수 있습니다.
            </p>
            <p className={P}>서비스는 만 14세 미만으로 알려진 이용자를 대상으로 맞춤형 광고를 하지 않습니다.</p>
          </Section>

          <Section id="children">
            <p className={P}>
              서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만 아동의 회원가입을 받지 않습니다. 만 14세 미만 아동의 정보가
              수집된 사실을 알게 되면 지체 없이 삭제합니다.
            </p>
          </Section>

          <Section id="officer">
            <p className={P}>
              개인정보 처리에 관한 업무를 총괄하고 이용자의 문의·불만·피해 구제를 처리하기 위해 아래와 같이 개인정보 보호책임자를 두고
              있습니다.
            </p>
            <dl className="mt-4 flex flex-col gap-2.5">
              <Entry title="개인정보 보호책임자">
                온더볼 운영자 · 이메일 <Contact />
              </Entry>
            </dl>
          </Section>

          <Section id="remedy">
            <p className={P}>
              개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.
            </p>
            <ul className={UL}>
              <li>
                개인정보침해신고센터 (국번 없이 118) — <External href="https://privacy.kisa.or.kr">privacy.kisa.or.kr</External>
              </li>
              <li>
                개인정보분쟁조정위원회 (1833-6972) — <External href="https://www.kopico.go.kr">www.kopico.go.kr</External>
              </li>
              <li>
                대검찰청 사이버수사과 (국번 없이 1301) — <External href="https://www.spo.go.kr">www.spo.go.kr</External>
              </li>
              <li>
                경찰청 사이버수사국 (국번 없이 182) — <External href="https://ecrm.police.go.kr">ecrm.police.go.kr</External>
              </li>
            </ul>
          </Section>

          <Section id="changes">
            <p className={P}>
              이 처리방침의 내용이 바뀌면 시행 7일 전부터 이 화면을 통해 알립니다. 수집 항목이나 이용 목적이 바뀌는 등 이용자의 권리에
              중요한 변경이 있으면 시행 30일 전부터 알립니다.
            </p>
            <p className={P}>
              이 처리방침은 <time dateTime={EFFECTIVE_DATE.iso}>{EFFECTIVE_DATE.label}</time>부터 시행합니다.
            </p>
          </Section>

          <SiteInfoLinks className="mt-10 border-t border-hairline pt-2" />
        </article>
      </main>
    </>
  );
}
