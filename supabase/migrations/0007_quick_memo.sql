-- =====================================================================
-- 0007: 자주 쓰는 내역에 메모 칸, 지출/수입 구분 추가
--  · 메모: 자주 쓰는 내역을 누르면 메모까지 채워진다 (기록 메모와 같은 200자)
--  · 지출/수입(kind): 수입도 자주 쓰는 내역으로 (용돈·중고 판매·부업 정산 등)
--    이미 있는 내역은 모두 '지출'
--  · 0001 다음에 한 번 실행. 다시 실행해도 괜찮다.
-- =====================================================================

alter table public.quick_entries
  add column if not exists memo text check (memo is null or char_length(memo) <= 200);

alter table public.quick_entries
  add column if not exists kind text not null default 'expense' check (kind in ('expense', 'income'));
