-- =====================================================================
-- 0006: '고정지출' 분류 없애기
--  · 고정 항목인지는 분류가 아니라 기록의 source = 'recurring' (+ recurring_item_id) 로 구분한다
--    → 고정비도 통신비·구독·보험처럼 사용자가 고른 진짜 분류로 들어간다
--  · 새로 가입하면 '고정지출' 분류를 만들지 않는다
--  · 이미 있는 '고정지출' 분류는 지우지 않고 숨긴다 (지난 기록의 분류 이름은 그대로 보임)
--    숨긴 뒤 앱 '설정 → 고정 수입·지출' 에서 '분류를 골라 주세요' 로 표시된 항목의 분류를 골라 주면 된다
--  · 0001 다음에 한 번 실행. 다시 실행해도 괜찮다.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_methods (user_id, type, name, sort_order)
  values (new.id, 'cash', '현금', 0);

  insert into public.categories (user_id, kind, name, color, is_savings, sort_order) values
    (new.id, 'expense', '식비',      '#FFD8C7', false, 1),
    (new.id, 'expense', '카페·간식', '#FFE9A8', false, 2),
    (new.id, 'expense', '생활용품',  '#C9EBD8', false, 3),
    (new.id, 'expense', '교통',      '#CFE2F8', false, 4),
    (new.id, 'expense', '쇼핑',      '#DCD3F7', false, 5),
    (new.id, 'expense', '문화·여가', '#F7D3E4', false, 6),
    (new.id, 'expense', '저축/투자', '#C8ECE9', true,  7),
    (new.id, 'expense', '기타',      '#E6DDD5', false, 8);

  insert into public.categories (user_id, kind, name, color, is_refund, sort_order) values
    (new.id, 'income', '급여', '#E6DDD5', false, 1),
    (new.id, 'income', '환불', '#CFE2F8', true,  2);

  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

-- 이미 있는 '고정지출' 분류 숨기기 (지우지 않음)
update public.categories
   set is_active = false
 where kind = 'expense' and name = '고정지출' and is_active;
