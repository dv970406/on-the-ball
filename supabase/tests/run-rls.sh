#!/usr/bin/env bash
# rls.sql을 돌리고 결과를 **양방향으로** 대조한다.
#
#   bash supabase/tests/run-rls.sh
#
# ⚠ 왜 스크립트가 필요한가: rls.sql은 결과를 눈으로 읽는 형태라 세 가지가 조용히 새어나간다.
#   ① 기대하지 않은 ERROR — 라벨이 "차단 기대"가 아닌데 에러가 난 경우
#   ② **차단 기대인데 통과한 경우** — 에러가 안 나니 로그가 깨끗해 보인다.
#      실제로 닉네임이 랜덤 배정으로 바뀌면서 유일성 검사 2건이 부딪힐 상대를 잃어
#      "중복이 차단된다"는 검사가 통과해 버렸는데, ①만 보던 눈으로는 못 잡았다.
#   ③ **라벨이 말한 값과 실제 값이 다른 경우** — 가장 조용하다. ①②는 에러/통과만 보므로
#      `[0행 기대]`가 1을 내도 둘 다 깨끗하다. 실제로 어드민 배치가 추가한 storage 정책이
#      섹션 24c의 열거 검사를 무력화했는데(라벨 0 / 실제 1) 러너는 "✅ 통과"라고 말했다.
#      그 검사가 지키던 성질은 그때부터 **어디서도 검증되지 않는 상태**였다.
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

# ── ③ 라벨이 말한 값 ↔ 실제 출력 대조 ────────────────────────────────────
# ⚠ **파서가 넓어질수록 오탐이 늘고, 오탐이 늘면 이 검사가 꺼진다.** 그래서 모양이 확실한
#   것만 비교하고 **나머지는 "대조 못 함"으로 세어 출력한다** — 커버리지가 조용히 줄어드는
#   것이 이 스크립트가 막으려는 바로 그 실패라, 못 한 것도 보이게 둔다.
# ⚠ `raise notice`로 값을 찍는 검사(sqlstate 확인)는 **구조적으로 대조할 수 없다** — 통지는
#   stdout이 아니라 stderr로 나가 라벨과 순서를 맞출 수 없다. 그 검사들은 계속 눈으로 본다.
# ⚠ 값이 여러 열이면 라벨도 열 수만큼 적는다(`[t/t 기대]`). 한 칸만 적으면 나머지 열이
#   조용히 검사에서 빠진다 — 실제로 두 라벨이 그 상태였다.
# ⚠ 값 자체에 `/`가 들어가면(URL 등) 이 파서가 구분자로 오해한다 → 그런 검사는 라벨에 값을
#   적지 말고 **질의를 불리언 단언으로** 바꾼다(`… = array[...] as ok` → `[t 기대]`).
#   비교가 DB 안에서 끝나 더 강하기도 하다.
out = pathlib.Path(sys.argv[1]).read_text().splitlines()

# 값이 아니라 명령 태그·서술인 라벨은 건드리지 않는다.
SKIP = re.compile(r"UPDATE|DELETE|INSERT|성공|전부|거부|남은|=")
SEP = re.compile(r"^-+(\+-+)*$")
ROWS = re.compile(r"^\((\d+) rows?\)$")
COUNTISH = re.compile(r"^(\d+)(행|건)$")

def blocks():
    """출력에서 `[… 기대]` 라벨과 그 다음 라벨 직전까지의 줄을 짝지어 돌려준다."""
    idx = [i for i, l in enumerate(out) if l.startswith("[")]
    for n, i in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(out)
        yield out[i], out[i + 1:end]

def results(body):
    """블록 안의 결과 집합을 **전부** 돌려준다 — [(데이터행들, 보고된 행 수)].

    ⚠ 첫 집합만 보면 안 된다. 한 라벨 아래에 여러 문장이 오고(`:login_*` 매크로가 찍는
      set_config, 준비용 select 등) 정작 라벨이 가리키는 값이 뒤에 오는 자리가 있다.
    ⚠ `set_config`는 로그인 매크로의 부산물이라 값 후보에서 뺀다."""
    sets, i = [], 0
    while i < len(body):
        if SEP.match(body[i].strip()):
            header = body[i - 1].strip() if i else ""
            rows, count = [], None
            j = i + 1
            while j < len(body):
                m = ROWS.match(body[j].strip())
                if m:
                    count = int(m.group(1)); j += 1; break
                if body[j].strip():
                    rows.append([c.strip() for c in body[j].split("|")])
                j += 1
            if header != "set_config":
                sets.append((rows, count))
            i = j
        else:
            i += 1
    return sets

def tokens(spec):
    """`/`가 있으면 그것만 구분자로 쓴다 — 셀 값에 공백이 들어갈 수 있다(`반 대`)."""
    parts = spec.split("/") if "/" in spec else spec.split()
    out_ = []
    for t in (t.strip() for t in parts):
        c = COUNTISH.match(t)
        out_.append(c.group(1) if c else t)   # `0행` → `0`
    return [t for t in out_ if t]

mismatch, unparsed = [], []
for label, body in blocks():
    m = re.match(r"^\[(.+?) 기대\]", label)
    if not m:
        continue
    spec = m.group(1).strip()
    if SKIP.search(spec):
        continue
    want = tokens(spec)
    sets = results(body)

    c = COUNTISH.match(spec)
    if c:  # `[0행 기대]` — "0행이 돌아온다"와 "count가 0이다" 둘 다 받아준다
        n = int(c.group(1))
        if any(cnt == n or (rows and len(rows) == 1 and rows[0] == [str(n)]) for rows, cnt in sets):
            continue
        got = "/".join(sets[0][0][0]) if sets and sets[0][0] else f"{sets[0][1] if sets else '?'}행"
        mismatch.append((label, spec, got)); continue

    # ⚠ 후보 집합 중 **하나라도** 맞으면 통과한다. 자릿수가 맞는 집합이 하나도 없으면
    #   비교 자체가 성립하지 않으므로 "대조 못 함"으로 센다(오탐으로 죽이지 않는다).
    cands = []
    for rows, _ in sets:
        if not rows:
            continue
        if len(want) == len(rows[0]):
            cands.append(rows[0])
        elif len(rows[0]) == 1 and len(want) == len(rows):
            cands.append([r[0] for r in rows])
    if not cands:
        unparsed.append(label); continue
    if not any(g == want for g in cands):
        mismatch.append((label, "/".join(want), "/".join(cands[0])))

print(f"차단 기대 라벨 {len(labels)}개 / ERROR {len(errlines)}건")
print(f"  ① 기대하지 않은 ERROR : {len(unexpected)}건")
for ln, l in unexpected: print(f"     ⚠ rls.sql:{ln}  {l}")
print(f"  ② 차단 기대인데 통과   : {len(missed)}건")
for ln, l in missed: print(f"     ⚠ rls.sql:{ln}  {l}")
print(f"  ③ 라벨과 값이 다름     : {len(mismatch)}건   (대조 못 한 라벨 {len(unparsed)}개)")
for lab, want, got in mismatch: print(f"     ⚠ {lab}\n        기대 {want} / 실제 {got}")
if unparsed:
    print("     · 대조 못 한 라벨(모양이 값 비교에 맞지 않는다):")
    for lab in unparsed: print(f"         {lab}")

if unexpected or missed or mismatch:
    print("\n❌ 실패 — 위 항목을 확인하세요.")
    sys.exit(1)
print("\n✅ 통과")
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
# ⚠ **고정 창(`grep -A N`)을 쓰지 않는다.** 3→6으로 넓혔더니 라벨 뒤에 `\echo`가 여러 줄
#   붙는 검사에서 또 값 행이 밀려났다(섹션 31e: 설명 5줄 → 헤더만 보이고 `1 | 2`가 사라짐).
#   N을 키우는 것은 같은 사고를 미루는 것뿐이라, **다음 라벨 직전까지**로 자른다 —
#   위 python의 `scope()`가 ERROR 판정에 쓰는 것과 같은 방식이다.
awk '/^\[.*기대/ { inblk = 1 } inblk' "$OUT" | grep -vE "^--$|SAVEPOINT|ROLLBACK|^\s*$"
exit $status
