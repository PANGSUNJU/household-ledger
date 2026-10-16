-- =====================================================================
-- 가계부 ④ — 폰 푸시 알림 (설치형 웹앱)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체 붙여넣기 → Run
--            (0001~0003 을 실행한 프로젝트에 한 번만)
-- 함께 하는 일: docs/DEPLOY.md '8. 폰 푸시 알림 켜기'
--
--  · 폰(브라우저)마다 알림 받을 주소를 저장한다 (push_subscriptions)
--  · 보내기는 Edge Function(send-reminders)이 10분마다 확인해서 정한 요일·시간이 된 사람에게 보낸다
--  · 같은 주에 두 번 보내지 않게 user_settings.remind_sent_on 에 보낸 날을 남긴다 (서버만 씀)
-- =====================================================================

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint      text not null unique check (char_length(endpoint) between 10 and 1000),  -- 알림 받을 주소 (폰·브라우저마다 다름)
  p256dh        text not null check (char_length(p256dh) <= 200),                         -- 알림 내용 암호화용 공개값
  auth          text not null check (char_length(auth) <= 100),
  device        text check (char_length(device) <= 100),                                  -- 예: 'Android Chrome'
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz
);
create index on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "본인 알림 주소 보기" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "본인 알림 주소 지우기" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- 저장은 아래 함수로만 (같은 폰이 다른 계정으로 바뀌어도 주소를 옮길 수 있게)

/**
 * 이 폰의 알림 주소 저장
 * 같은 주소가 다른 계정에 있으면 지우고 지금 계정으로 옮긴다 (한 폰 = 지금 로그인한 계정만 받음)
 */
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception '알림 주소가 올바르지 않아요';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 100));
end $$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- 이번 주 알림을 보낸 날 (Edge Function 이 서버 권한으로만 쓴다. 앱에서는 바꿀 수 없다)
alter table public.user_settings add column remind_sent_on date;
