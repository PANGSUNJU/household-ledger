-- =====================================================================
-- 가계부 ② 고정 항목 (고정 수입·지출 자동 기록)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체 붙여넣기 → Run
--            (0001_init.sql 을 이미 실행한 프로젝트에 한 번만)
-- 기준 문서: docs/SPEC.md 5-4(고정 항목), 6장(recurring_items), 7장(고정 항목 날짜)
--
-- 동작
--  · 고정 항목을 등록해 두면, 앱을 열 때 generate_recurring() 이
--    날짜가 된(오늘까지) 회차를 기록(transactions)으로 만든다. 서버 상시 실행 없음(0원).
--  · 금액 고정 → 확정 기록 / 매달 다름 → '금액 입력 필요' 기록 (사용자가 채움)
--  · 같은 항목·같은 달 회차는 두 번 만들지 않는다 (유일 인덱스)
--  · 항목마다 어디까지 만들었는지(generated_until) 기억한다.
--    → 만들어진 기록을 지우면 다시 생기지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 고정 항목
-- ---------------------------------------------------------------------
create table public.recurring_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind               text not null check (kind in ('expense', 'income')),
  name               text not null check (char_length(name) between 1 and 30),
  is_amount_fixed    boolean not null default true,
  amount             int check (amount is null or amount > 0),     -- 매달 다르면 비어 있음
  day_of_month       int not null check (day_of_month between 1 and 31), -- 그 달에 없으면 말일
  weekend_rule       text not null default 'before' check (weekend_rule in ('before', 'after')),
  category_id        uuid,
  payment_method_id  uuid,
  start_date         date not null default ((now() at time zone 'Asia/Seoul')::date),
  end_date           date,
  generated_until    date,   -- 이 날짜까지의 회차는 이미 만들었음
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  check (is_amount_fixed = (amount is not null)),
  check (end_date is null or end_date >= start_date),
  foreign key (category_id, user_id)       references public.categories (id, user_id) on delete set null (category_id),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete set null (payment_method_id)
);
create index on public.recurring_items (user_id, is_active, sort_order);
create trigger trg_ri_touch before update on public.recurring_items
  for each row execute function public.touch_updated_at();

-- 분류는 같은 종류(지출/수입)만. 시작일을 앞당기면 그 사이 회차를 다시 만들 수 있게 표시를 지운다.
create or replace function public.check_recurring_item()
returns trigger language plpgsql as $$
begin
  if new.category_id is not null and not exists (
       select 1 from public.categories
        where id = new.category_id and user_id = new.user_id and kind = new.kind and not is_refund) then
    raise exception '고정 항목의 분류는 같은 종류(지출/수입)여야 해요';
  end if;
  if tg_op = 'UPDATE' and new.start_date < old.start_date then
    new.generated_until := null;
  end if;
  return new;
end $$;
create trigger trg_ri_check before insert or update on public.recurring_items
  for each row execute function public.check_recurring_item();

-- ---------------------------------------------------------------------
-- 기록에 고정 항목 연결
-- ---------------------------------------------------------------------
alter table public.transactions
  add column recurring_item_id uuid,
  add column recurring_month   date,   -- 몇 월 회차인지 (그 달 1일). 주말 규칙으로 날짜가 넘어가도 회차는 그대로
  add foreign key (recurring_item_id, user_id)
      references public.recurring_items (id, user_id) on delete set null (recurring_item_id);
create unique index transactions_one_per_recurring_month
  on public.transactions (recurring_item_id, recurring_month) where recurring_item_id is not null;
create index on public.transactions (user_id, source, recurring_month);

-- ---------------------------------------------------------------------
-- 고정 항목 날짜 (SPEC 7장)
--  그 달의 day_of_month (없으면 말일) → 토·일이면 before: 금요일 / after: 월요일
--  앱(src/lib/recurring.js occurrenceDate)과 같은 규칙. 둘을 함께 고칠 것.
-- ---------------------------------------------------------------------
create or replace function public.recurring_date(p_month date, p_day int, p_rule text)
returns date language plpgsql immutable as $$
declare
  v_first date := date_trunc('month', p_month)::date;
  last_day int := extract(day from (v_first + interval '1 month - 1 day'))::int;
  d date := v_first + (least(p_day, last_day) - 1);
  dow int := extract(dow from d)::int;   -- 0=일, 6=토
begin
  if dow = 6 then
    d := d + case when p_rule = 'before' then -1 else 2 end;
  elsif dow = 0 then
    d := d + case when p_rule = 'before' then -2 else 1 end;
  end if;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- 날짜가 된 회차를 기록으로 만들기 — 앱을 열 때 호출
--  p_today: 테스트용. 한국 오늘보다 뒤는 받지 않는다 (미래 회차를 미리 만들지 않게)
--  돌려주는 값: 새로 만든 기록 수
-- ---------------------------------------------------------------------
create or replace function public.generate_recurring(p_today date default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
  v_today   date := least(coalesce(p_today, kst_today), kst_today);
  it        record;
  v_from    date;
  m         date;
  d         date;
  made      int := 0;
  c         int;
begin
  for it in
    select * from public.recurring_items
     where user_id = auth.uid() and is_active and start_date <= v_today
     for update
  loop
    -- 아직 안 만든 구간: (generated_until, 오늘]. 너무 오래된 건 2년까지만
    v_from := greatest(it.start_date, coalesce(it.generated_until + 1, it.start_date), v_today - 730);

    -- 주말 규칙으로 앞/뒤 달로 넘어가는 회차까지 보려고 한 달씩 넓게 돈다
    m := (date_trunc('month', v_from) - interval '1 month')::date;
    while m <= (date_trunc('month', v_today) + interval '1 month')::date loop
      d := public.recurring_date(m, it.day_of_month, it.weekend_rule);
      if d between v_from and v_today and (it.end_date is null or d <= it.end_date) then
        insert into public.transactions
          (user_id, kind, date, amount, store_name, category_id, payment_method_id,
           source, status, recurring_item_id, recurring_month)
        values
          (it.user_id, it.kind, d, case when it.is_amount_fixed then it.amount end, it.name,
           it.category_id, it.payment_method_id, 'recurring',
           case when it.is_amount_fixed then 'confirmed' else 'needs_amount' end, it.id, m)
        on conflict (recurring_item_id, recurring_month) where recurring_item_id is not null do nothing;
        get diagnostics c = row_count;
        made := made + c;
      end if;
      m := (m + interval '1 month')::date;
    end loop;

    update public.recurring_items set generated_until = v_today where id = it.id;
  end loop;
  return made;
end $$;

revoke all on function public.generate_recurring(date) from public, anon;
grant execute on function public.generate_recurring(date) to authenticated;

-- ---------------------------------------------------------------------
-- 행 단위 보안: 본인 데이터만
-- ---------------------------------------------------------------------
alter table public.recurring_items enable row level security;
create policy "본인 고정 항목" on public.recurring_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
