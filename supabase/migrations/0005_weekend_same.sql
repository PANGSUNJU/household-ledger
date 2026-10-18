-- =====================================================================
-- 0005: 고정 항목 '주말이면' 에 '그날 그대로' 추가
--  · 'before' 앞 평일 / 'after' 뒤 평일 / 'same' 주말이어도 그날 (카드 자동결제·구독 등)
--  · 0002 다음에 한 번 실행. 다시 실행해도 괜찮다.
-- =====================================================================

alter table public.recurring_items drop constraint if exists recurring_items_weekend_rule_check;
alter table public.recurring_items
  add constraint recurring_items_weekend_rule_check check (weekend_rule in ('before', 'after', 'same'));

-- 앱 src/lib/recurring.js occurrenceDate 와 같은 규칙. 둘을 함께 고칠 것.
create or replace function public.recurring_date(p_month date, p_day int, p_rule text)
returns date language plpgsql immutable as $$
declare
  v_first date := date_trunc('month', p_month)::date;
  last_day int := extract(day from (v_first + interval '1 month - 1 day'))::int;
  d date := v_first + (least(p_day, last_day) - 1);
  dow int := extract(dow from d)::int;   -- 0=일, 6=토
begin
  if p_rule = 'same' then
    return d;
  end if;
  if dow = 6 then
    d := d + case when p_rule = 'before' then -1 else 2 end;
  elsif dow = 0 then
    d := d + case when p_rule = 'before' then -2 else 1 end;
  end if;
  return d;
end $$;
