-- 0009: 계정을 지우면 '환불' 분류도 같이 지워지게
-- 평소엔 그대로 환불 분류를 지울 수 없고, 계정 자체가 지워질 때만 허용해요.
-- 다시 실행해도 괜찮아요.

create or replace function public.protect_refund_category()
returns trigger language plpgsql
security definer set search_path = ''  -- 계정 표(auth.users)를 읽기만 하려고
as $$
begin
  if tg_op = 'DELETE' and old.is_refund
     and exists (select 1 from auth.users where id = old.user_id) then
    raise exception '환불 분류는 지울 수 없어요';
  end if;
  if tg_op = 'UPDATE' and old.is_refund
     and (new.is_active = false or new.is_refund = false or new.kind <> 'income') then
    raise exception '환불 분류는 숨기거나 바꿀 수 없어요';
  end if;
  return coalesce(new, old);
end $$;
