-- =====================================================================
-- 닉네임 유일성
--
-- 게시판에서 유일한 신원 표시가 닉네임인데 중복이 허용돼 있었다.
-- `a@x.com`과 `a@y.com`이 둘 다 nickname `a`가 되어 사칭이 가능했다.
--
-- 대소문자를 구분하지 않는다 — "Alice"와 "alice"가 공존하면 유일성이 무의미하다.
-- 그래서 UNIQUE 제약이 아니라 lower(nickname) 유니크 **인덱스**를 쓴다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 기존 중복 정리 (인덱스를 만들기 전에)
--    가장 먼저 만들어진 계정이 원래 닉네임을 지키고, 나머지에 -2, -3 … 을 붙인다.
--
-- ⚠ 생성한 값이 **또 다른 기존 값과 충돌**할 수 있다 —
--   'a'가 2건이고 'a-2'가 이미 있으면 두 번째 'a'를 'a-2'로 바꾸는 순간 새 중복이 생기고
--   바로 아래 인덱스 생성이 23505로 실패한다. 비어 있는 후보가 나올 때까지 올린다.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_suffix int;
  v_candidate text;
begin
  for r in
    select id, nickname,
           row_number() over (partition by lower(nickname) order by created_at, id) as rn
      from public.profiles
  loop
    continue when r.rn = 1;  -- 최초 계정은 원래 닉네임을 지킨다

    v_suffix := r.rn - 1;
    loop
      v_suffix := v_suffix + 1;
      v_candidate := left(r.nickname, 20 - length(v_suffix::text) - 1) || '-' || v_suffix::text;
      exit when not exists (
        select 1 from public.profiles q where lower(q.nickname) = lower(v_candidate)
      );
    end loop;
    update public.profiles set nickname = v_candidate where id = r.id;
  end loop;
end $$;

create unique index profiles_nickname_lower_key on public.profiles (lower(nickname));

comment on index public.profiles_nickname_lower_key is
  '닉네임 유일성(대소문자 무시). 위반 시 23505 — handle_new_user가 이 이름으로 충돌을 판별한다';

-- ---------------------------------------------------------------------
-- 2. 가입 시 충돌하지 않는 닉네임을 만들어 준다
--
-- 이메일 로컬파트를 그대로 쓰면 도메인만 다른 계정끼리 반드시 충돌한다.
-- 충돌하면 -2, -3 … 을 붙여 재시도한다.
--
-- ⚠ "미리 조회해서 비어 있으면 insert"로는 부족하다 — 동시에 같은 닉네임으로 가입하면
--   둘 다 통과한 뒤 하나가 터진다. **insert를 시도하고 unique_violation을 잡는** 방식이라야
--   경합에서도 안전하다.
-- ⚠ unique_violation은 PK(id) 중복으로도 발생한다. CONSTRAINT_NAME으로 닉네임 충돌만
--   골라내고 나머지는 그대로 던진다 — 안 그러면 진짜 오류가 무한 루프가 된다.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_base       text;
  v_nickname   text;
  v_suffix     int := 1;
  v_constraint text;
begin
  -- nullif로 빈 문자열까지 흡수한다(coalesce는 NULL만 막는다).
  -- 접미사 "-999"가 붙어도 20자를 넘지 않도록 16자로 자른다.
  --
  -- ⚠ btrim이 **필수**다. 마이그레이션 6의 profiles_nickname_trimmed가 "앞뒤 공백 없음"을
  --   요구하는데, 이메일 로컬파트에 공백이 있으면 여기서 그대로 통과해 CHECK 위반이 되고,
  --   아래 예외 핸들러는 unique_violation만 잡으므로 **가입 트랜잭션이 통째로 롤백된다**.
  --   지금은 GoTrue의 이메일 검증이 그런 주소를 400으로 막아주지만, 방어선이 그것 하나뿐이면
  --   프로바이더가 바뀌는 순간 가입 기능이 죽는다. 트리거가 만든 값이 트리거가 걸어 둔 제약을
  --   항상 만족한다는 불변식은 트리거 자신이 보장해야 한다.
  v_base := left(btrim(split_part(coalesce(nullif(new.email, ''), 'user'), '@', 1)), 16);
  -- 자른 뒤 끝에 공백이 남을 수 있다("ab cdefghijklmno p" → 16자 컷) → 한 번 더 다듬는다
  v_base := btrim(v_base);
  if v_base is null or v_base = '' then
    v_base := 'user';
  end if;
  v_nickname := v_base;

  loop
    begin
      insert into public.profiles (id, nickname) values (new.id, v_nickname);
      return new;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'profiles_nickname_lower_key' then
        raise;  -- 닉네임 충돌이 아니다(예: 이미 프로필이 있는 유저) — 삼키지 않는다
      end if;

      v_suffix := v_suffix + 1;
      if v_suffix > 100 then
        -- 같은 로컬파트가 100개 — 순번 대신 임의값으로 떨어뜨린다
        v_nickname := left(v_base, 13) || '-' ||
                      substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      else
        v_nickname := v_base || '-' || v_suffix::text;
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
