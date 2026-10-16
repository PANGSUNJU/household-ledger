-- =====================================================================
-- 10분마다 주간 정리 알림 보내기 예약 (send-reminders Edge Function 을 배포한 뒤 한 번만 실행)
-- 실행 방법: SQL Editor 에 붙여넣고, 아래 두 군데 <…> 를 바꾼 뒤 Run
--   <프로젝트ID>   : Supabase 주소 https://<프로젝트ID>.supabase.co 의 그 부분
--   <CRON_SECRET>  : Edge Functions → Secrets 에 넣은 CRON_SECRET 과 같은 값
-- ⚠️ 이 파일에 진짜 값을 넣어 저장하거나 git 에 올리지 마세요. SQL Editor 에서만 바꿔서 실행해요.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 비밀값은 Supabase 금고(Vault)에 넣어 두고 꺼내 쓴다
select vault.create_secret('<CRON_SECRET>', 'reminder_cron_secret');

select cron.schedule(
  'send-weekly-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<프로젝트ID>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 확인: select * from cron.job;            (예약 목록)
--       select * from cron.job_run_details order by start_time desc limit 5;   (최근 실행)
-- 그만두기: select cron.unschedule('send-weekly-reminders');
