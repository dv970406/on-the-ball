#!/usr/bin/env bash
# rls.sql을 돌리고 결과를 **양방향으로** 대조한다.
#
#   bash supabase/tests/run-rls.sh
#
# ⚠ 왜 스크립트가 필요한가: rls.sql은 결과를 눈으로 읽는 형태라 두 가지가 조용히 새어나간다.
#   ① 기대하지 않은 ERROR — 라벨이 "차단 기대"가 아닌데 에러가 난 경우
#   ② **차단 기대인데 통과한 경우** — 이쪽이 더 위험하다. 에러가 안 나니 로그가 깨끗해 보인다.
#      실제로 닉네임이 랜덤 배정으로 바뀌면서 유일성 검사 2건이 부딪힐 상대를 잃어
#      "중복이 차단된다"는 검사가 통과해 버렸는데, ①만 보던 눈으로는 못 잡았다.
set -uo pipefail
cd "$(dirname "$0")/../.."

OUT=$(mktemp); ERR=$(mktemp)
trap 'rm -f "$OUT" "$ERR"' EXIT

PGPASSWORD=postgres psql -h 127.0.0.1 -p 64322 -U postgres -d postgres \
  -f supabase/tests/rls.sql >"$OUT" 2>"$ERR"

python3 - "$OUT" "$ERR" <<'PY'
import re, sys, pathlib

src = pathlib.Path("supabase/tests/rls.sql").read_text().splitlines()
err = pathlib.Path(sys.argv[2]).read_text()
errlines = {int(m.group(1)) for m in re.finditer(r"psql:supabase/tests/rls\.sql:(\d+): ERROR", err)}
blocked = re.compile(r"echo '\[(❌차단|거부 기대)")

# 라벨 위치 → 그 아래 12줄 안에 에러가 났는지로 판정한다(한 검사가 그보다 길지 않다)
labels = [(i + 1, l.strip()[:80]) for i, l in enumerate(src) if blocked.search(l)]
missed = [(ln, l) for ln, l in labels if not any(x in errlines for x in range(ln + 1, ln + 13))]

unexpected = []
for ln in sorted(errlines):
    lab = next((src[i] for i in range(ln - 1, max(-1, ln - 12), -1)
                if src[i].lstrip().startswith("\\echo '[")), None)
    if not lab or not blocked.search(lab):
        unexpected.append((ln, (lab or "(라벨 없음)").strip()[:80]))

print(f"차단 기대 라벨 {len(labels)}개 / ERROR {len(errlines)}건")
print(f"  ① 기대하지 않은 ERROR : {len(unexpected)}건")
for ln, l in unexpected: print(f"     ⚠ rls.sql:{ln}  {l}")
print(f"  ② 차단 기대인데 통과   : {len(missed)}건")
for ln, l in missed: print(f"     ⚠ rls.sql:{ln}  {l}")

if unexpected or missed:
    print("\n❌ 실패 — 위 항목을 확인하세요.")
    sys.exit(1)
print("\n✅ 통과 (값 검사는 여전히 눈으로 본다 — 아래 출력의 '기대' 라벨을 대조하세요)")
PY
status=$?
echo
echo "── 값 검사 결과 (라벨 ↔ 실제 값) ─────────────────────"
grep -A3 "^\[.*기대" "$OUT" | grep -vE "^--$|SAVEPOINT|ROLLBACK|^\s*$" | head -80
exit $status
