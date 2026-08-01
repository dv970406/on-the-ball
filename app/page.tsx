/**
 * 임시 플레이스홀더 — v1 기능 청산 후 새 화면이 정해질 때까지의 자리.
 * 새 라우트를 설계하면 이 파일을 교체하거나 라우트 그룹으로 옮긴다.
 */
export default function Page() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-lg font-bold text-ink">온더볼</p>
      <p className="text-sm text-ink-mute">
        새 구조를 설계하는 중입니다.
        <br />
        기존 기능은 <code className="font-mono text-xs">docs/legacy/v1-inventory.md</code> 에
        기록해 두었습니다.
      </p>
    </main>
  );
}
