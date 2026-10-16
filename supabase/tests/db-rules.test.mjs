import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const db = new PGlite({ extensions: { pgcrypto } })
const migration = readFileSync(process.argv[2], 'utf8')

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
await db.exec(migration)
await db.exec(`grant all on all tables in schema public to authenticated;
  revoke update on public.user_settings from authenticated;
  grant update (lock_timeout) on public.user_settings to authenticated;`)

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
