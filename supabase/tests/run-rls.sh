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
any_label = re.compile(r"^\s*\\echo '\[")

# ⚠ 각 라벨의 판정 범위는 **다음 라벨 직전까지**다. 고정 줄수(12줄)로 잡았더니 검사가 촘촘한
#   구간에서 **다음 검사의 ERROR를 자기 것으로 오인**해, 실제로는 통과해 버린 검사를
#   "차단됨"으로 보고했다(섹션 12가 그렇게 새어나갔다). 창을 라벨 경계로 자른다.
label_lines = [i + 1 for i, l in enumerate(src) if any_label.search(l)]
def scope(ln):
    nxt = next((x for x in label_lines if x > ln), len(src) + 1)
    return range(ln + 1, nxt)

labels = [(ln, src[ln - 1].strip()[:80]) for ln in label_lines if blocked.search(src[ln - 1])]
missed = [(ln, l) for ln, l in labels if not any(x in errlines for x in scope(ln))]

unexpected = []
for ln in sorted(errlines):
    owner = max((x for x in label_lines if x < ln), default=None)
    lab = src[owner - 1] if owner else None
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
# ⚠ 여기에 `head -N` 상한을 두지 않는다. 한때 80줄로 자르고 있었는데, 값 검사는 파일 순서대로
#   출력되므로 **가장 나중에 추가한 섹션이 먼저 잘린다** — 새 검사를 붙일수록 그 검사만
#   안 보이는 셈이라, 이 스크립트가 막으려던 "검사가 죽은 채 로그만 깨끗해지는" 상태를
#   스스로 만든다(실측: 전체 214줄 중 134줄이 가려져 있었다).
# ⚠ 창을 3줄로 잡았더니 앞에 `INSERT 0 1` 같은 명령 결과가 끼는 검사에서 **정작 확인해야 할
#   값 행이 잘려 나갔다**(섹션 26·`random_nickname`이 그랬다). 위 상한 문제와 같은 클래스다.
grep -A6 "^\[.*기대" "$OUT" | grep -vE "^--$|SAVEPOINT|ROLLBACK|^\s*$"
exit $status
