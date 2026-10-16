import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const db = new PGlite({ extensions: { pgcrypto } })
// 마이그레이션 파일을 순서대로 모두 실행 (0001, 0002 …)
const migrations = process.argv.slice(2).map((f) => readFileSync(f, 'utf8'))

// Supabase 흉내: auth 스키마, 역할, auth.uid()
await db.exec(`
  create schema if not exists extensions;
  create schema auth;
  create table auth.users (id uuid primary key);
  create role anon; create role authenticated;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to authenticated;
  grant execute on function auth.uid() to authenticated;
  alter default privileges in schema public grant all on tables to authenticated;
`)
for (const m of migrations) await db.exec(m)
await db.exec(`grant all on all tables in schema public to authenticated;
  revoke update on public.user_settings from authenticated;
  grant update (lock_timeout) on public.user_settings to authenticated;
  grant update (remind_enabled, remind_weekday, remind_time, remind_done_on) on public.user_settings to authenticated;`)

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`)

let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name) }
async function as(uid, sql, params) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`)
  return db.query(sql, params)
}
async function expectError(name, uid, sql) {
  try { await as(uid, sql); ok(name, false) } catch (e) { ok(name + ' → ' + e.message, true) }
}

// 1. 가입 시 기본값
const cats = await as(A, `select kind, name, is_savings, is_refund from categories order by kind, sort_order`)
ok('지출 9 + 수입 2 기본 분류', cats.rows.length === 11)
ok('저축/투자 표시', cats.rows.some(r => r.name === '저축/투자' && r.is_savings))
ok('환불 표시', cats.rows.some(r => r.name === '환불' && r.is_refund))
const pm = await as(A, `select name from payment_methods`)
ok('현금 기본 결제수단', pm.rows.length === 1 && pm.rows[0].name === '현금')

// 2. 다른 사람 데이터는 안 보임
const bCats = await as(B, `select count(*)::int c from categories`)
ok('B는 자기 분류 11개만 봄', bCats.rows[0].c === 11)

// 3. 지출 → 환불 흐름 (10,000 쇼핑 / 9,200 환불)
const shop = (await as(A, `select id from categories where name='쇼핑'`)).rows[0].id
const refundCat = (await as(A, `select id from categories where is_refund`)).rows[0].id
const exp = (await as(A, `insert into transactions (kind, date, amount, store_name, category_id) values ('expense', '2026-10-12', 10000, '온라인 쇼핑몰', $1) returning id`, [shop])).rows[0].id
const ref = (await as(A, `insert into transactions (kind, date, amount, store_name, category_id, refund_of_id) values ('income', '2026-10-16', 9200, '온라인 쇼핑몰', $1, $2) returning refund_category_id`, [refundCat, exp])).rows[0]
ok('환불 연결 시 빼는 분류 자동 = 쇼핑', ref.refund_category_id === shop)

// 4. 다른 사람 기록·분류에 연결 불가
const bShop = (await as(B, `select id from categories where name='쇼핑'`)).rows[0].id
await expectError('A가 B의 분류로 기록 못 함', A, `insert into transactions (kind, date, amount, category_id) values ('expense','2026-10-16',1000,'${bShop}')`)
await expectError('B가 A의 지출에 환불 연결 못 함', B, `insert into transactions (kind, date, amount, refund_of_id) values ('income','2026-10-16',1000,'${exp}')`)
const bSees = await as(B, `select count(*)::int c from transactions`)
ok('B는 A 기록을 못 봄', bSees.rows[0].c === 0)

// 5. 규칙 위반
await expectError('환불 분류 숨기기 막힘', A, `update categories set is_active=false where is_refund`)
await expectError('환불 분류 삭제 막힘', A, `delete from categories where is_refund`)
await expectError('환불을 수입 기록에 연결 막힘', A, `insert into transactions (kind,date,amount,refund_of_id) values ('income','2026-10-16',1,(select id from transactions where kind='income' limit 1))`)
await expectError('음수 금액 막힘', A, `insert into transactions (kind,date,amount) values ('expense','2026-10-16',-1)`)
await expectError('확정 기록에 금액 없음 막힘', A, `insert into transactions (kind,date) values ('expense','2026-10-16')`)
await expectError('빼는 분류에 수입 분류 막힘', A, `insert into transactions (kind,date,amount,refund_category_id) values ('income','2026-10-16',1,'${refundCat}')`)
await as(A, `update categories set is_active=false where name='기타'`)
ok('일반 분류 숨기기는 됨', true)

// 6. 화면 잠금
await expectError('잠금 비번 직접 수정 막힘', A, `update user_settings set lock_pin_hash='x'`)
await as(A, `select set_lock_pin('1234')`)
const s = (await as(A, `select lock_enabled, lock_pin_hash from user_settings`)).rows[0]
ok('잠금 켜짐 + 원래 숫자 저장 안 됨', s.lock_enabled && s.lock_pin_hash !== '1234')
ok('맞는 비번 확인', (await as(A, `select verify_lock_pin('1234') v`)).rows[0].v === true)
ok('틀린 비번 거부', (await as(A, `select verify_lock_pin('0000') v`)).rows[0].v === false)
ok('B는 A 비번으로 통과 못 함', (await as(B, `select verify_lock_pin('1234') v`)).rows[0].v === false)
await expectError('3자리 비번 거부', A, `select set_lock_pin('123')`)
await as(A, `update user_settings set lock_timeout = 300`)
ok('다시 묻는 시간 변경은 됨', (await as(A, `select lock_timeout from user_settings`)).rows[0].lock_timeout === 300)
await as(A, `select disable_lock()`)
ok('잠금 끄기', (await as(A, `select lock_enabled from user_settings`)).rows[0].lock_enabled === false)

// 7. 원래 지출 삭제 시 환불은 남고 연결만 끊김
await as(A, `delete from transactions where id='${exp}'`)
const left = (await as(A, `select refund_of_id, refund_category_id from transactions where kind='income'`)).rows[0]
ok('원래 지출 지우면 환불 기록은 남음', left && left.refund_of_id === null)

// 8. 고정 항목 날짜 규칙 (SPEC 7장)
const rd = async (month, day, rule) => (await as(A, `select recurring_date($1::date, $2, $3)::text d`, [month, day, rule])).rows[0].d
ok('25일이 토요일 → 앞 평일 금요일', (await rd('2026-07-01', 25, 'before')) === '2026-07-24')
ok('25일이 토요일 → 뒤 평일 월요일', (await rd('2026-07-01', 25, 'after')) === '2026-07-27')
ok('31일 → 2월은 말일(28일, 토) → 27일 금', (await rd('2026-02-01', 31, 'before')) === '2026-02-27')
ok('1일이 토요일 + 앞 평일 → 전달 31일', (await rd('2026-08-01', 1, 'before')) === '2026-07-31')
ok('1일이 일요일 + 뒤 평일 → 2일 월요일', (await rd('2026-03-01', 1, 'after')) === '2026-03-02')

// 9. 고정 항목 → 기록 자동 생성
const salaryCat = (await as(A, `select id from categories where name='급여'`)).rows[0].id
const fixedCat = (await as(A, `select id from categories where name='고정지출'`)).rows[0].id
const salary = (await as(A, `insert into recurring_items (kind,name,amount,day_of_month,weekend_rule,category_id,start_date)
  values ('income','월급',3200000,25,'before',$1,'2026-06-01') returning id`, [salaryCat])).rows[0].id
const ins = (await as(A, `insert into recurring_items (kind,name,amount,day_of_month,weekend_rule,category_id,start_date)
  values ('expense','실비보험',55000,1,'after',$1,'2026-06-01') returning id`, [fixedCat])).rows[0].id
const elec = (await as(A, `insert into recurring_items (kind,name,is_amount_fixed,amount,day_of_month,weekend_rule,category_id,start_date)
  values ('expense','전기요금',false,null,15,'before',$1,'2026-07-01') returning id`, [fixedCat])).rows[0].id
const made1 = (await as(A, `select generate_recurring('2026-08-10') n`)).rows[0].n
ok('8/10까지: 월급 2 + 보험 3 + 전기 1 = 6건 생성', made1 === 6)
const sal = (await as(A, `select date::text d, recurring_month::text m, status, source from transactions where recurring_item_id=$1 order by date`, [salary])).rows
ok('월급 7/25(토) → 7/24 기록, 회차는 7월', sal[1]?.d === '2026-07-24' && sal[1]?.m === '2026-07-01' && sal[1]?.source === 'recurring')
const insAug = (await as(A, `select date::text d from transactions where recurring_item_id=$1 and recurring_month='2026-08-01'`, [ins])).rows[0]
ok('보험 8/1(토) + 뒤 평일 → 8/3', insAug?.d === '2026-08-03')
const el = (await as(A, `select status, amount from transactions where recurring_item_id=$1`, [elec])).rows
ok('매달 다른 금액 → 금액 입력 필요, 금액 비어 있음', el.length === 1 && el[0].status === 'needs_amount' && el[0].amount === null)
ok('다시 불러도 같은 회차는 안 만듦', (await as(A, `select generate_recurring('2026-08-10') n`)).rows[0].n === 0)
await as(A, `delete from transactions where recurring_item_id=$1 and recurring_month='2026-07-01'`, [ins])
const made2 = (await as(A, `select generate_recurring('2026-08-31') n`)).rows[0].n
ok('8/31까지: 월급 8/25 + 전기 8/14 = 2건 (지운 7월 보험은 다시 안 생김)', made2 === 2)
const elAug = (await as(A, `select date::text d from transactions where recurring_item_id=$1 and recurring_month='2026-08-01'`, [elec])).rows[0]
ok('전기 8/15(토) + 앞 평일 → 8/14', elAug?.d === '2026-08-14')

// 금액 채우기
await as(A, `update transactions set amount=48200, status='confirmed' where recurring_item_id=$1 and recurring_month='2026-07-01'`, [elec])
ok('금액 입력 필요 → 금액 넣고 확정', (await as(A, `select status from transactions where recurring_item_id=$1 and recurring_month='2026-07-01'`, [elec])).rows[0].status === 'confirmed')

// 수정은 다음 회차부터 (이미 만든 기록은 그대로)
await as(A, `update recurring_items set amount=60000 where id=$1`, [ins])
ok('보험료 수정해도 지난 기록 금액은 그대로', (await as(A, `select amount from transactions where recurring_item_id=$1 and recurring_month='2026-06-01'`, [ins])).rows[0].amount === 55000)
await as(A, `select generate_recurring('2026-09-01')`)
ok('다음 회차(9/1)부터 새 금액', (await as(A, `select amount from transactions where recurring_item_id=$1 and recurring_month='2026-09-01'`, [ins])).rows[0]?.amount === 60000)

// 미래 회차는 만들지 않음 (한국 오늘 이후 X)
await as(A, `select generate_recurring('2099-01-01')`)
ok('오늘 이후 날짜 기록은 안 만듦', (await as(A, `select count(*)::int c from transactions where source='recurring' and date > (now() at time zone 'Asia/Seoul')::date`)).rows[0].c === 0)

// 그만둔 항목은 안 만듦
const stopCount = (await as(A, `select count(*)::int c from transactions where recurring_item_id=$1`, [salary])).rows[0].c
await as(A, `update recurring_items set is_active=false where id=$1`, [salary])
await as(A, `update recurring_items set generated_until='2026-09-01' where id=$1`, [salary])
await as(A, `select generate_recurring()`)
ok('그만둔 고정 항목은 더 안 만듦', (await as(A, `select count(*)::int c from transactions where recurring_item_id=$1`, [salary])).rows[0].c === stopCount)

// 시작일을 앞당기면 그 사이 회차를 만든다
const late = (await as(A, `insert into recurring_items (kind,name,amount,day_of_month,category_id,start_date)
  values ('expense','구독',9900,10,$1,'2026-09-20') returning id`, [fixedCat])).rows[0].id
await as(A, `select generate_recurring('2026-09-30')`)
ok('9/20 시작 → 9/10 회차 없음', (await as(A, `select count(*)::int c from transactions where recurring_item_id=$1`, [late])).rows[0].c === 0)
await as(A, `update recurring_items set start_date='2026-09-01' where id=$1`, [late])
await as(A, `select generate_recurring('2026-09-30')`)
ok('시작일을 9/1로 앞당기면 9/10 회차 생성', (await as(A, `select date::text d from transactions where recurring_item_id=$1`, [late])).rows[0]?.d === '2026-09-10')

// 규칙 위반·다른 사람
await expectError('금액 고정인데 금액 없음 막힘', A, `insert into recurring_items (kind,name,day_of_month) values ('expense','x',1)`)
await expectError('지출 고정 항목에 수입 분류 막힘', A, `insert into recurring_items (kind,name,amount,day_of_month,category_id) values ('expense','x',1,1,'${salaryCat}')`)
await expectError('32일 막힘', A, `insert into recurring_items (kind,name,amount,day_of_month) values ('expense','x',1,32)`)
ok('B는 A 고정 항목을 못 봄', (await as(B, `select count(*)::int c from recurring_items`)).rows[0].c === 0)
ok('B가 불러도 A 기록은 안 생김', (await as(B, `select generate_recurring('2026-09-30') n`)).rows[0].n === 0)
await expectError('B가 A 고정 항목으로 기록 못 함', B, `insert into transactions (kind,date,amount,recurring_item_id,recurring_month) values ('expense','2026-12-01',1,'${ins}','2026-12-01')`)
await as(A, `delete from recurring_items where id=$1`, [late])
ok('고정 항목을 지워도 지난 기록은 남음', (await as(A, `select count(*)::int c from transactions where store_name='구독' and source='recurring'`)).rows[0].c === 1)

// 10. 예산 (0003)
await as(A, `insert into budgets (month, amount) values ('2026-10-01', 1000000)`)
ok('예산 저장', (await as(A, `select amount from budgets where month='2026-10-01'`)).rows[0].amount === 1000000)
await expectError('같은 달 예산 두 번 막힘', A, `insert into budgets (month, amount) values ('2026-10-01', 1)`)
await expectError('1일이 아닌 달 막힘', A, `insert into budgets (month, amount) values ('2026-10-05', 1)`)
await expectError('0원 예산 막힘', A, `insert into budgets (month, amount) values ('2026-11-01', 0)`)
await as(A, `insert into budgets (month, amount) values ('2026-11-01', 900000) on conflict (user_id, month) do update set amount = excluded.amount`)
ok('B는 A 예산 못 봄', (await as(B, `select count(*)::int c from budgets`)).rows[0].c === 0)

// 11. 가게 이름 짝
await as(A, `insert into store_aliases (raw_name, display_name) values ('(주)아성다이소 경산점', '다이소')`)
ok('가게 이름 짝 저장', (await as(A, `select display_name from store_aliases where raw_name='(주)아성다이소 경산점'`)).rows[0].display_name === '다이소')
await as(A, `insert into store_aliases (raw_name, display_name) values ('(주)아성다이소 경산점', '다이소 경산') on conflict (user_id, raw_name) do update set display_name = excluded.display_name`)
ok('같은 이름은 덮어쓰기', (await as(A, `select count(*)::int c from store_aliases`)).rows[0].c === 1)
ok('B는 A 가게 이름 짝 못 봄', (await as(B, `select count(*)::int c from store_aliases`)).rows[0].c === 0)

// 12. 주간 정리 알림 설정
await as(A, `update user_settings set remind_enabled=true, remind_weekday=0, remind_time='21:30'`)
const rs = (await as(A, `select remind_enabled, remind_weekday, remind_time::text t from user_settings`)).rows[0]
ok('알림 설정 저장', rs.remind_enabled && rs.remind_weekday === 0 && rs.t === '21:30:00')
await expectError('요일 7 막힘', A, `update user_settings set remind_weekday=7`)
await expectError('알림 설정 바꿔도 잠금 비번은 여전히 직접 못 바꿈', A, `update user_settings set lock_pin_hash='x'`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
