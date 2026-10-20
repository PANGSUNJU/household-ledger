-- 0008: 원래 구매의 분류를 바꾸면, 연결된 환불의 '빼는 분류'도 같이 바뀐다
-- 다시 실행해도 괜찮아요.

create or replace function public.sync_refund_category()
returns trigger language plpgsql as $$
begin
  if new.kind = 'expense' and new.category_id is distinct from old.category_id then
    update public.transactions
       set refund_category_id = new.category_id
     where refund_of_id = new.id
       and user_id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_tx_refund_follow on public.transactions;
create trigger trg_tx_refund_follow
  after update of category_id on public.transactions
  for each row execute function public.sync_refund_category();
