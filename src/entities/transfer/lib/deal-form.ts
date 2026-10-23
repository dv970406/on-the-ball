import type { TransferDeal, TransferDealForm, TransferLoanClause } from "../model/types";

/**
 * 딜 형태의 표기 — 단일 소스. 단계(진전)와 직교하는 축이라 상태 뱃지를 늘리지 않고 **글자 표지**(`DealFormMark`) 하나로 따로 그린다.
 * - `mark`: 경로 앞·뱃지 옆의 짧은 표지. 완전 이적은 표지가 없다(보드 대부분이 완전 이적이라 모든 행에 붙이면 소음이다).
 * - `label`: 상세의 "형태" 줄·스크린리더 문구.
 * - `noun`: 제목·알림에 이름 뒤로 붙는 말("가르나초 임대"). 완전 이적은 붙이지 않는다(`dealNoun`이 "이적"으로 채운다).
 * ⚠ 알림 스크립트(`scripts/lib/transfer/notify.mjs`의 `FORM_NOUN`)가 `noun`의 사본을 갖는다 — 테스트가 이 파일을 읽어 대조하므로
 *   **한 줄에 `키: { mark, label, noun },` 꼴**을 지킨다.
 * ⚠ 진행 중 임대(`loan_standing`)는 보도의 형태라 딜에 오지 않지만(DB CHECK) 타입이 enum 그대로라 채워 둔다(임대와 같은 표기).
 */
export const DEAL_FORM: Record<TransferDealForm, { mark: string | null; label: string; noun: string | null }> = {
  permanent: { mark: null, label: "완전 이적", noun: null },
  loan: { mark: "임대", label: "임대", noun: "임대" },
  loan_convert: { mark: "완전 영입", label: "임대 후 완전 영입", noun: "완전 영입" },
  loan_standing: { mark: "임대", label: "임대", noun: "임대" },
  loan_recall: { mark: "조기 복귀", label: "임대 조기 복귀", noun: "조기 복귀" },
  loan_extend: { mark: "임대 연장", label: "임대 연장", noun: "임대 연장" },
};

/** 임대 조항의 표기 — 표지에는 짧은 말, 형태 줄에는 풀어 쓴 말 */
const CLAUSE: Record<TransferLoanClause, { short: string; label: string }> = {
  option: { short: "옵션", label: "완전 이적 옵션" },
  obligation: { short: "의무", label: "완전 이적 의무" },
};

/** 조항이 형태 표기에 붙는 형태 — 새 임대·임대 연장(전환은 조항을 행사하는 사건이라 표지에 붙이지 않는다) */
const CLAUSE_IN_MARK: ReadonlySet<TransferDealForm> = new Set(["loan", "loan_standing", "loan_extend"]);

/** 임대 계열 형태인가 — 완전 이적·모름이 아니다 */
export function isLoanForm(form: TransferDealForm | null): boolean {
  return form !== null && form !== "permanent";
}

/**
 * 형태 표지 — 완전 이적·모름(`null`)이면 그리지 않는다(`null`). 임대·연장에 조항이 있으면 표지에 붙이고(`임대·의무`), 형태 줄의 문구는
 * 풀어 쓴다(`완전 이적 의무부 임대`).
 * ⚠ 형태를 모르는 딜을 완전 이적으로 짐작하지 않는다 — 표지를 그리지 않을 뿐 "완전 이적"이라 말하지 않는다.
 */
export function dealFormMark(deal: Pick<TransferDeal, "form" | "loanClause">): { mark: string; label: string } | null {
  if (deal.form === null) return null;
  const base = DEAL_FORM[deal.form];
  if (base.mark === null) return null;
  if (deal.loanClause !== null && CLAUSE_IN_MARK.has(deal.form)) {
    const clause = CLAUSE[deal.loanClause];
    return { mark: `${base.mark}·${clause.short}`, label: `${clause.label}부 ${base.label}` };
  }
  return { mark: base.mark, label: base.label };
}

/**
 * 상세의 "형태" 줄 — 형태를 알면 그 문구(완전 이적 포함), 모르면 `null`(줄을 그리지 않는다).
 */
export function dealFormLabel(deal: Pick<TransferDeal, "form" | "loanClause">): string | null {
  if (deal.form === null) return null;
  return dealFormMark(deal)?.label ?? DEAL_FORM[deal.form].label;
}

/** 제목·알림에서 이름 뒤에 붙이는 말 — 형태의 말, 없으면(완전 이적·모름) "이적" */
export function dealNoun(form: TransferDealForm | null): string {
  return (form !== null ? DEAL_FORM[form].noun : null) ?? "이적";
}

/**
 * 경로 밖의 임대 상태 한 줄 — "빌라 임대 중". 출발(보유 구단) 아래 주석으로만 그린다(세 구단을 화살표로 이으면 연쇄 이적으로 읽힌다).
 * 임대 구단이 출발·행선지와 같으면 경로가 이미 말하므로 `null`이다(가르나초의 빌라 완전 영입 전환). 조기 복귀는 임대가 끝나는 사건이라 `null`.
 * `full`이면 정식명(경로 카드처럼 폭을 이름에 내줄 수 있는 자리), 아니면 약칭.
 */
export function loanNote(
  deal: Pick<TransferDeal, "form" | "loanClub" | "fromClub" | "toClub">,
  { full = false }: { full?: boolean } = {},
): string | null {
  const club = deal.loanClub;
  if (!club || deal.form === "loan_recall") return null;
  if (club.code === deal.fromClub?.code || club.code === deal.toClub?.code) return null;
  return `${full ? club.name : club.shortName} 임대 중`;
}

/**
 * 완전 이적 조항 금액에 붙이는 조건 한 줄 — 의무는 "조건이 맞으면 완전 이적", 옵션은 "임대 구단이 행사하면 완전 이적". 대표 금액이 조항
 * 금액일 때만(`buy_clause`) 그린다 — 그 금액이 지금 오간 이적료가 아니라 **앞으로의 조건부 금액**이라는 것을 금액 바로 아래에서 말한다.
 * 조항을 모르면 일반 문구다.
 */
export function clauseNote(deal: Pick<TransferDeal, "feeKind" | "loanClause">): string | null {
  if (deal.feeKind !== "buy_clause") return null;
  if (deal.loanClause === "obligation") return "조건이 맞으면 완전 이적";
  if (deal.loanClause === "option") return "임대 구단이 행사하면 완전 이적";
  return "임대에 붙은 완전 이적 조항";
}

/**
 * 보드의 형태 필터 — URL `?type=loan`(임대 계열만). 모르는 값은 `null`(전체로 폴백 — 파라미터 오염이 빈 목록을 만들지 않게).
 * 해석은 이 함수 하나가 갖는다(`parseTransferLeague`와 같은 이유 — 링크를 만드는 곳과 해석하는 곳이 갈리면 조용히 어긋난다).
 */
export type TransferTypeFilter = "loan";
export function parseTransferType(value: string | null | undefined): TransferTypeFilter | null {
  return value === "loan" ? "loan" : null;
}

/** 형태 필터 — `loan`이면 임대 계열 딜만, `null`이면 전부 */
export function dealMatchesType(deal: Pick<TransferDeal, "form">, type: TransferTypeFilter | null): boolean {
  return type === null || isLoanForm(deal.form);
}
