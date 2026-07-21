/** 내 프로필 (profiles 테이블) — 익명 로그인 시 트리거로 자동 생성 */
export interface Profile {
  id: string;
  nickname: string;
  /** 팬 태그 (예: "아스널 팬") — 미설정 시 null */
  fanTeam: string | null;
  /** 연령대 — 추후 입력 UI 추가 예정 (지금은 null) */
  ageGroup: string | null;
  /** 지역 — 추후 입력 UI 추가 예정 (지금은 null) */
  region: string | null;
  /** 퀴즈 연속 정답 일수 (오답 시 0으로 리셋) */
  currentStreak: number;
  bestStreak: number;
  joinedAt: string;
}
