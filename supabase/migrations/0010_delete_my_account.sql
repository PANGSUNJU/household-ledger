-- 0010: 앱 안에서 '계정 삭제' (Play 스토어 요구사항)
-- 본인 계정만 지워요. 기록은 0001~0004 의 on delete cascade 로 모두 같이 지워지고,
-- 환불 분류는 0009 덕분에 계정이 지워질 때 함께 지워져요.
-- 다시 실행해도 괜찮아요.

create or replace function public.delete_my_account()
returns void language plpgsql
security definer set search_path = ''  -- 계정 표(auth.users)는 앱 사용자 권한으로 못 지워서
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
