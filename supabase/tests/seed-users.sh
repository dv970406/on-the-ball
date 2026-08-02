#!/usr/bin/env bash
# 로컬 테스트 계정 2개(alice/bob)를 만든다. `supabase db reset` 뒤에 실행.
#   bash supabase/tests/seed-users.sh
set -uo pipefail

API="http://127.0.0.1:64321"
ANON=$(supabase status -o env 2>/dev/null | grep '^ANON_KEY' | cut -d'"' -f2)
if [ -z "$ANON" ]; then echo "supabase 스택이 떠 있지 않습니다"; exit 1; fi

for e in alice@test.com bob@test.com; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/v1/signup" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$e\",\"password\":\"test1234\"}")
  echo "$code $e"
done

psql "postgresql://postgres:postgres@127.0.0.1:64322/postgres" -c \
  "select u.email, p.nickname from auth.users u join public.profiles p on p.id = u.id order by u.email;"
