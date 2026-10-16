-- =====================================================================
-- 가계부 ②③④ — 예산, 가게 이름 짝, 주간 정리 알림 설정
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체 붙여넣기 → Run
--            (0001, 0002 를 실행한 프로젝트에 한 번만)
-- 기준 문서: docs/SPEC.md 5-5(예산), 5-7(이미지 읽기), 5-8(알림), 6장
-- =====================================================================

-- ---------------------------------------------------------------------
-- 예산 (②): 한 달 총예산 하나
-- ---------------------------------------------------------------------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),   -- 그 달 1일
  amount      int  not null check (amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, month)
);
create trigger trg_budget_touch before update on public.budgets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 가게 이름 짝 (③): 이미지에서 읽힌 이름 → 내가 고친 이름 (글자가 똑같을 때만)
-- ---------------------------------------------------------------------
create table public.store_aliases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw_name      text not null check (char_length(raw_name) between 1 and 80),
  display_name  text not null check (char_length(display_name) between 1 and 50),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, raw_name)
);
create trigger trg_alias_touch before update on public.store_aliases
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 주간 정리 알림 설정 (④)
-- ---------------------------------------------------------------------
alter table public.user_settings
  add column remind_enabled  boolean not null default false,
  add column remind_weekday  int  not null default 0 check (remind_weekday between 0 and 6), -- 0=일 ~ 6=토
  add column remind_time     time not null default '21:00',
  add column remind_done_on  date;   -- 이번 주 안내를 확인(정리 완료)한 날

-- 설정 표는 칸마다 바꿀 수 있는지 정해 둔다 (잠금 비밀번호는 함수로만)
grant update (remind_enabled, remind_weekday, remind_time, remind_done_on) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------
-- 행 단위 보안: 본인 데이터만
-- ---------------------------------------------------------------------
alter table public.budgets       enable row level security;
alter table public.store_aliases enable row level security;
create policy "본인 예산" on public.budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "본인 가게 이름 짝" on public.store_aliases
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
