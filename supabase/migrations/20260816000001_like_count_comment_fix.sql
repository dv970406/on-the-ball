-- post.like_count 컬럼 주석을 실제 관리 주체와 맞춘다.
--
-- 초기 마이그레이션(20260801000002)은 "toggle_post_like RPC만 갱신"이라고 적었는데,
-- 20260801000004에서 카운터 관리가 **트리거로 이관**됐다(RPC는 잠금·검증·토글만 하고
-- 카운터는 건드리지 않는다). 주석만 그대로 남아, DB에서 근거를 조회하면
-- "비정규화 카운터는 트리거가 단독으로 관리한다"는 규약과 **반대로 읽힌다.**
--
-- 이관의 이유가 바로 그 주석에 걸려 있다: 유저 탈퇴로
-- auth.users → profiles → post_like가 cascade 삭제되는 경로는 RPC를 거치지 않아
-- 카운터가 실제보다 큰 채 영구히 남았다(check >= 0 때문에 자가 교정도 불가능했다).
-- 그래서 "어느 경로로 행이 생기고 사라지든 맞는" 트리거가 단독 관리한다.
--
-- ⚠ 원격에 적용된 마이그레이션은 수정하지 않고 새 파일로 덧쓴다(api-and-db.md).

comment on column public.post.like_count is
  'post_like의 after insert/delete 트리거(sync_post_like_count)만 갱신한다. '
  'toggle_post_like RPC는 잠금·검증·토글만 하고 이 값을 건드리지 않는다. '
  '일반 유저에게 update 권한 없음.';
