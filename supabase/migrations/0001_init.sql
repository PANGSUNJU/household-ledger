-- =====================================================================
-- 가계부 ① 최소 버전 — 데이터베이스 초기 설정
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 내용 전체 붙여넣기 → Run
-- 기준 문서: docs/SPEC.md 6장(데이터 구조), 7장(계산 규칙)
--
-- 원칙
--  · 모든 표에 user_id 가 있고, 로그인한 본인 데이터만 읽고 쓴다 (행 단위 보안)
--  · 금액은 원 단위 정수, 날짜는 시간 없는 date (한국 날짜)
--  · 카드번호·계좌번호는 저장하지 않는다 (결제수단은 이름만)
--  · 결제수단·분류는 지우지 않고 숨긴다 (지난 기록이 깨지지 않게)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 공통: 수정 시각 자동 갱신
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 결제수단
-- ---------------------------------------------------------------------
create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('cash', 'card', 'transfer')),
  name        text not null check (char_length(name) between 1 and 30),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.payment_methods (user_id, is_active, sort_order);
create trigger trg_pm_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 분류
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('expense', 'income')),
  name        text not null check (char_length(name) between 1 and 20),
  color       text not null default '#E6DDD5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_savings  boolean not null default false,  -- 저축/투자: 소비 합계와 따로 계산
  is_refund   boolean not null default false,  -- 환불: 수입 합계에서 빼고 지출에서 차감
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check (not is_savings or kind = 'expense'),
  check (not is_refund or kind = 'income')
);
create index on public.categories (user_id, kind, is_active, sort_order);
-- 사용자마다 환불 분류는 하나만
create unique index categories_one_refund_per_user on public.categories (user_id) where is_refund;
create trigger trg_cat_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- 환불 분류는 지우거나 숨길 수 없다 (SPEC 6: 통계 계산에 쓰임)
create or replace function public.protect_refund_category()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.is_refund then
    raise exception '환불 분류는 지울 수 없어요';
  end if;
  if tg_op = 'UPDATE' and old.is_refund
     and (new.is_active = false or new.is_refund = false or new.kind <> 'income') then
    raise exception '환불 분류는 숨기거나 바꿀 수 없어요';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_cat_protect_refund before update or delete on public.categories
  for each row execute function public.protect_refund_category();

-- ---------------------------------------------------------------------
-- 기록 (지출·수입)
-- ---------------------------------------------------------------------
create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind                text not null check (kind in ('expense', 'income')),
  date                date not null,
  amount              int  check (amount is null or amount >= 0),   -- 비어 있으면 '금액 입력 필요'(②)
  store_name          text check (store_name is null or char_length(store_name) <= 50),
  category_id         uuid,   -- 비어 있으면 미분류
  payment_method_id   uuid,   -- 비어 있으면 미지정
  refund_of_id        uuid,   -- 환불일 때: 환불받은 원래 지출
  refund_category_id  uuid,   -- 환불일 때: 빼는 지출 분류 (원래 지출의 분류를 따름)
  memo                text check (memo is null or char_length(memo) <= 200),
  source              text not null default 'manual' check (source in ('manual', 'recurring', 'image')),
  status              text not null default 'confirmed' check (status in ('confirmed', 'needs_amount')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  -- 다른 사람의 분류·결제수단·기록을 가리키지 못하게 (user_id 를 함께 묶어 연결)
  foreign key (category_id, user_id)        references public.categories (id, user_id),
  foreign key (refund_category_id, user_id) references public.categories (id, user_id),
  foreign key (payment_method_id, user_id)  references public.payment_methods (id, user_id),
  foreign key (refund_of_id, user_id)       references public.transactions (id, user_id) on delete set null (refund_of_id),
  check (status = 'needs_amount' or amount is not null),
  check (refund_of_id is null or kind = 'income'),
  check (refund_category_id is null or kind = 'income')
);
create index on public.transactions (user_id, date);
create index on public.transactions (user_id, store_name);
create index on public.transactions (refund_of_id);
create trigger trg_tx_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- 환불 기록 정리: 원래 지출을 고르면 빼는 분류를 자동으로 맞춘다 (SPEC 10-B)
create or replace function public.fill_refund_category()
returns trigger language plpgsql as $$
declare
  orig record;
begin
  if new.refund_of_id is not null then
    select kind, category_id into orig
      from public.transactions
     where id = new.refund_of_id and user_id = new.user_id;
    if orig.kind is distinct from 'expense' then
      raise exception '환불은 지출 기록에만 연결할 수 있어요';
    end if;
    new.refund_category_id := orig.category_id;
  end if;
  -- 원래 구매를 못 찾아 분류를 직접 고른 경우: 지출 분류여야 한다
  if new.refund_category_id is not null and not exists (
       select 1 from public.categories
        where id = new.refund_category_id and user_id = new.user_id and kind = 'expense') then
    raise exception '빼는 분류는 지출 분류여야 해요';
  end if;
  return new;
end $$;
create trigger trg_tx_refund before insert or update of refund_of_id on public.transactions
  for each row execute function public.fill_refund_category();

-- ---------------------------------------------------------------------
-- 자주 쓰는 내역 (빠른 입력)
-- ---------------------------------------------------------------------
create table public.quick_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 30),
  amount             int  not null check (amount >= 0),
  category_id        uuid,
  payment_method_id  uuid,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (category_id, user_id)       references public.categories (id, user_id) on delete set null (category_id),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete set null (payment_method_id)
);
create index on public.quick_entries (user_id, sort_order);
create trigger trg_qe_touch before update on public.quick_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 사용자 설정 (화면 잠금)
-- ---------------------------------------------------------------------
create table public.user_settings (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  lock_enabled   boolean not null default false,       -- 기본은 꺼짐
  lock_pin_hash  text,                                  -- 숫자 4자리를 알아볼 수 없게 바꾼 값
  lock_timeout   int not null default 0 check (lock_timeout in (0, 60, 300, 1800)), -- 초: 즉시/1분/5분/30분
  updated_at     timestamptz not null default now(),
  check (not lock_enabled or lock_pin_hash is not null)
);
create trigger trg_us_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- 잠금 비밀번호 설정 / 확인 — 원래 숫자는 저장하지 않는다
create or replace function public.set_lock_pin(pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if pin !~ '^[0-9]{4}$' then
    raise exception '비밀번호는 숫자 4자리예요';
  end if;
  insert into public.user_settings (user_id, lock_enabled, lock_pin_hash)
  values (auth.uid(), true, crypt(pin, gen_salt('bf')))
  on conflict (user_id) do update
    set lock_enabled = true, lock_pin_hash = excluded.lock_pin_hash;
end $$;

create or replace function public.verify_lock_pin(pin text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select coalesce(
    (select lock_pin_hash = crypt(pin, lock_pin_hash)
       from public.user_settings where user_id = auth.uid()),
    false)
$$;

create or replace function public.disable_lock()
returns void language sql security definer set search_path = public as $$
  update public.user_settings
     set lock_enabled = false, lock_pin_hash = null
   where user_id = auth.uid()
$$;

revoke all on function public.set_lock_pin(text), public.verify_lock_pin(text), public.disable_lock() from public, anon;
grant execute on function public.set_lock_pin(text), public.verify_lock_pin(text), public.disable_lock() to authenticated;

-- ---------------------------------------------------------------------
-- 행 단위 보안: 본인 데이터만
-- ---------------------------------------------------------------------
alter table public.payment_methods enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.quick_entries   enable row level security;
alter table public.user_settings   enable row level security;

create policy "본인 결제수단" on public.payment_methods
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "본인 분류" on public.categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "본인 기록" on public.transactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "본인 빠른 입력" on public.quick_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 설정은 읽기만 직접, 잠금 비밀번호는 위 함수로만 바꾼다
create policy "본인 설정 읽기" on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy "본인 설정 시간 변경" on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.user_settings from authenticated;
grant update (lock_timeout) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------
-- 가입하면 기본값 만들기: 현금, 지출 분류 9개, 수입 분류(급여·환불), 설정
-- ---------------------------------------------------------------------
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
    (new.id, 'expense', '고정지출',  '#E6DDD5', false, 7),
    (new.id, 'expense', '저축/투자', '#C8ECE9', true,  8),
    (new.id, 'expense', '기타',      '#E6DDD5', false, 9);

  insert into public.categories (user_id, kind, name, color, is_refund, sort_order) values
    (new.id, 'income', '급여', '#E6DDD5', false, 1),
    (new.id, 'income', '환불', '#CFE2F8', true,  2);

  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
