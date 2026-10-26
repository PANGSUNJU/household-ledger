/*
 * 데이터 읽기·저장은 모두 이 파일을 거친다. (SPEC 10-D: 저장 코드는 한곳에)
 * 나중에 오프라인 입력(v2)을 붙일 때 이 파일만 고치면 된다.
 */
import { supabase } from './supabase'
import { format, daysInMonth } from './date'
import { MAX_AMOUNT } from './money'
import { bump, cachedList } from './sync'

function check({ data, error }) {
  if (error) throw error
  return data
}

/**
 * 아직 실행하지 않은 SQL(0002, 0003) 때문에 표·칸·함수가 없을 때 Supabase가 주는 오류인지
 *  PGRST205 표 없음 / PGRST202 함수 없음 / 42P01 표 없음 / 42883 함수 없음 / 42703 칸 없음
 */
/** 자주 쓰는 내역 메모·지출/수입 칸이 아직 없을 때 (SQL 0007 전) */
export function isMissingQuickMemo(e) {
  return /(memo|kind)/.test(e?.message || '') && /quick_entries/.test(e?.message || '') && /(not find|does not exist|schema cache)/i.test(e?.message || '')
}

export function isMissingSetup(e) {
  const code = e?.code || ''
  if (['PGRST205', 'PGRST202', '42P01', '42883', '42703'].includes(code)) return true
  return /(recurring_items|recurring_item_id|recurring_month|generate_recurring|budgets|store_aliases|remind_)/.test(e?.message || '') &&
    /(not find|does not exist|schema cache)/i.test(e?.message || '')
}

/*
 * 한 번 '없음'을 확인한 기능은 이번 실행 동안 다시 묻지 않는다
 * (SQL 실행 전이면 화면을 열 때마다 빨간 오류 요청이 쌓이지 않게. 앱을 새로 열면 다시 확인)
 */
const missing = { recurring: null, v3: null }
async function guarded(feature, fn) {
  if (missing[feature]) throw missing[feature]
  try {
    return await fn()
  } catch (e) {
    if (isMissingSetup(e)) missing[feature] = e
    throw e
  }
}

// 금액 최댓값은 money.js 와 같은 값 (10억 원)

/* ---------- 분류 ---------- */

export function listCategories({ includeHidden = false } = {}) {
  return cachedList('categories:' + includeHidden, async () => {
    let q = supabase.from('categories').select('*').order('kind').order('sort_order')
    if (!includeHidden) q = q.eq('is_active', true)
    return check(await q)
  })
}

/* ---------- 결제수단 ---------- */

export function listPaymentMethods({ includeHidden = false } = {}) {
  return cachedList('payment_methods:' + includeHidden, async () => {
    let q = supabase.from('payment_methods').select('*').order('sort_order')
    if (!includeHidden) q = q.eq('is_active', true)
    return check(await q)
  })
}

/** 결제수단 새로 등록 (입력 화면에서 바로) */
async function addPaymentMethodRaw({ type, name }) {
  const { data: last } = await supabase
    .from('payment_methods').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(
    await supabase.from('payment_methods').insert({ type, name: name.trim(), sort_order }).select('*').single()
  )
}

/* ---------- 자주 쓰는 내역 (빠른 입력) ---------- */

export async function listQuickEntries() {
  return check(await supabase.from('quick_entries').select('*').order('sort_order'))
}

/* ---------- 기록 ---------- */

const TX_FIELDS = `
  id, kind, date, amount, store_name, memo, status, source,
  category_id, payment_method_id, refund_of_id, refund_category_id,
  category:categories!transactions_category_id_user_id_fkey ( id, name, color, is_savings, is_refund ),
  payment_method:payment_methods ( id, name, type )
`

/**
 * 기간 안의 기록 (from, to 모두 포함, 'YYYY-MM-DD')
 * Supabase는 한 번에 최대 1,000건만 주므로 1,000건씩 나눠 끝까지 받는다 (긴 기간 통계·CSV)
 */
export async function listTransactions(from, to) {
  const PAGE = 1000
  const all = []
  for (let start = 0; ; start += PAGE) {
    const rows = check(
      await supabase
        .from('transactions')
        .select(TX_FIELDS)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(start, start + PAGE - 1)
    )
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

/** 한 달 기록 */
export function listMonth(y, m) {
  return listTransactions(format(y, m, 1), format(y, m, daysInMonth(y, m)))
}

/** 기록 하나 */
export async function getTransaction(id) {
  return check(await supabase.from('transactions').select(TX_FIELDS).eq('id', id).single())
}

/**
 * 같은 가게의 가장 최근 지출 (가게별 기본값: 분류·결제수단 미리 고르기)
 * 1차는 가게 이름이 똑같을 때만 (SPEC 5-1)
 */
export async function lastExpenseAtStore(storeName) {
  if (!storeName?.trim()) return null
  const rows = check(
    await supabase.from('transactions')
      .select('category_id, payment_method_id')
      .eq('kind', 'expense').eq('store_name', storeName.trim())
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(1)
  )
  return rows[0] || null
}

/** 마지막으로 쓴 결제수단 (결제수단 기본값) */
export async function lastPaymentMethodId() {
  const rows = check(
    await supabase.from('transactions')
      .select('payment_method_id')
      .not('payment_method_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
  )
  return rows[0]?.payment_method_id || null
}

/** 환불할 구매 찾기용: 최근 지출 (from 이후, 최신순) */
export async function recentExpenses(from, limit = 100) {
  return check(
    await supabase.from('transactions')
      .select(TX_FIELDS)
      .eq('kind', 'expense').eq('status', 'confirmed')
      .gte('date', from)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(limit)
  )
}

/**
 * 기록 저장 (id 가 있으면 수정)
 *  · 금액이 들어 있으면 확정. '금액 입력 필요' 고정 지출에 금액을 넣으면 확정으로 바뀐다.
 *  · 어디서 만들어졌는지(source)는 처음 만들 때만 정한다 (고정 항목 기록을 고쳐도 고정 항목 기록으로 남게)
 */
async function saveTransactionRaw(tx) {
  const row = {
    kind: tx.kind,
    date: tx.date,
    amount: tx.amount,
    status: tx.amount == null ? 'needs_amount' : 'confirmed',
    store_name: tx.store_name || null,
    category_id: tx.category_id || null,
    payment_method_id: tx.payment_method_id || null,
    refund_of_id: tx.refund_of_id || null,
    refund_category_id: tx.refund_category_id || null,
    memo: tx.memo || null
  }
  const q = tx.id
    ? supabase.from('transactions').update(row).eq('id', tx.id)
    : supabase.from('transactions').insert({ ...row, source: tx.source || 'manual' })
  return check(await q.select('id').single())
}

async function deleteTransactionRaw(id) {
  return check(await supabase.from('transactions').delete().eq('id', id))
}

/* ---------- 검색 (내역 화면) ---------- */

/** 가게·메모로 검색, 숫자만 넣으면 금액도 같이 찾기 (최근 200건) */
/** 검색: 사용처·메모·금액. range 가 있으면 그 기간 안에서만 ({ from, to? } 'YYYY-MM-DD')
 *  · 최대 SEARCH_LIMIT 건 (넘으면 화면에서 안내) */
export const SEARCH_LIMIT = 1000
export async function searchTransactions(text, range = null) {
  const q = text.trim()
  const digits = q.replace(/[,\s원]/g, '')
  // PostgREST or() 문법에 쓰이는 기호는 빼서 안전하게
  const safe = q.replace(/[(),*%\\]/g, ' ').trim()
  const conds = []
  if (safe) conds.push(`store_name.ilike.*${safe}*`, `memo.ilike.*${safe}*`)
  // 카드번호처럼 긴 숫자는 금액 칸(int) 범위를 넘어 오류가 나므로 금액 검색에서 뺀다
  if (/^\d{1,10}$/.test(digits) && Number(digits) <= MAX_AMOUNT) conds.push(`amount.eq.${digits}`)
  if (!conds.length) return []
  let q2 = supabase.from('transactions').select(TX_FIELDS).or(conds.join(','))
  if (range?.from) q2 = q2.gte('date', range.from)
  if (range?.to) q2 = q2.lte('date', range.to)
  return check(
    await q2
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(SEARCH_LIMIT)
  )
}

/* ---------- 관리: 결제수단 ---------- */

async function updatePaymentMethodRaw(id, patch) {
  return check(await supabase.from('payment_methods').update(patch).eq('id', id).select('*').single())
}

/* ---------- 관리: 분류 ---------- */

async function addCategoryRaw({ kind, name, color }) {
  const { data: last } = await supabase.from('categories').select('sort_order')
    .eq('kind', kind).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(await supabase.from('categories').insert({ kind, name: name.trim(), color, sort_order }).select('*').single())
}

async function updateCategoryRaw(id, patch) {
  return check(await supabase.from('categories').update(patch).eq('id', id).select('*').single())
}

/* ---------- 관리: 자주 쓰는 내역 ---------- */

/** 메모·수입은 있을 때만 보낸다 (SQL 0007 전이어도 메모 없는 지출 등록은 되게) */
async function addQuickEntryRaw({ name, amount, category_id, payment_method_id, memo, kind }) {
  const { data: last } = await supabase.from('quick_entries').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(await supabase.from('quick_entries')
    .insert({ name: name.trim(), amount, category_id: category_id || null, payment_method_id: payment_method_id || null, sort_order, ...(memo ? { memo } : {}), ...(kind === 'income' ? { kind } : {}) })
    .select('*').single())
}

async function updateQuickEntryRaw(id, patch) {
  return check(await supabase.from('quick_entries').update(patch).eq('id', id).select('*').single())
}

async function deleteQuickEntryRaw(id) {
  return check(await supabase.from('quick_entries').delete().eq('id', id))
}

/** 순서 바꾸기: 목록 전체의 sort_order 를 다시 매긴다 (table: 'payment_methods' | 'categories' | 'quick_entries') */
/** 순서 저장: [{ id, sort_order }] (바뀐 줄만 넘기면 그만큼만 저장) */
async function saveOrderRaw(table, rows) {
  await Promise.all(rows.map(({ id, sort_order }) =>
    supabase.from(table).update({ sort_order }).eq('id', id).then(check)))
}

/* ---------- 설정: 화면 잠금 ---------- */

export async function getSettings() {
  const { data, error } = await supabase.from('user_settings').select('lock_enabled, lock_timeout').maybeSingle()
  if (error) throw error
  return data || { lock_enabled: false, lock_timeout: 0 }
}

export async function setLockPin(pin) {
  return check(await supabase.rpc('set_lock_pin', { pin }))
}

export async function verifyLockPin(pin) {
  return check(await supabase.rpc('verify_lock_pin', { pin }))
}

export async function disableLock() {
  return check(await supabase.rpc('disable_lock'))
}

/** 본인 계정과 모든 기록을 지운다 (SQL 0010). 되돌릴 수 없음 */
export async function deleteMyAccount() {
  return check(await supabase.rpc('delete_my_account'))
}

export async function setLockTimeout(seconds) {
  return check(await supabase.from('user_settings').update({ lock_timeout: seconds }).not('user_id', 'is', null))
}

/* ---------- 고정 항목 (②) ---------- */
/* 고정 항목 관련 조회는 0002 SQL 을 실행해야 쓸 수 있다. 다른 화면 조회(TX_FIELDS)에는 새 칸을 넣지 않아서
   SQL 실행 전에도 캘린더·내역·통계는 그대로 동작한다. */

const FIXED_FIELDS = `
  id, kind, date, amount, store_name, status, source, recurring_item_id, recurring_month,
  category:categories!transactions_category_id_user_id_fkey ( id, name, color, is_savings, is_refund )
`

export async function listRecurringItems() {
  return guarded('recurring', async () =>
    check(await supabase.from('recurring_items').select('*').order('kind').order('sort_order').order('created_at')))
}

async function addRecurringItemRaw(row) {
  const { data: last } = await supabase.from('recurring_items').select('sort_order')
    .eq('kind', row.kind).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(await supabase.from('recurring_items').insert({ ...row, sort_order }).select('*').single())
}

async function updateRecurringItemRaw(id, patch) {
  return check(await supabase.from('recurring_items').update(patch).eq('id', id).select('*').single())
}

async function deleteRecurringItemRaw(id) {
  return check(await supabase.from('recurring_items').delete().eq('id', id))
}

/** 날짜가 된 고정 항목 회차를 기록으로 만든다 (앱을 열 때). 새로 만든 수를 돌려준다 */
async function generateRecurringRaw() {
  return guarded('recurring', async () => check(await supabase.rpc('generate_recurring')))
}

/** '금액 입력 필요' 기록 (오래된 것부터) */
export async function listNeedsAmount() {
  return check(
    await supabase.from('transactions').select(TX_FIELDS)
      .eq('status', 'needs_amount')
      .order('date', { ascending: true })
      .limit(50)
  )
}

/** 고정 항목에서 만들어진 기록 (회차 기준 fromMonth~toMonth, 'YYYY-MM-01') */
export async function listFixedTransactions(fromMonth, toMonth) {
  return guarded('recurring', async () => check(
    await supabase.from('transactions').select(FIXED_FIELDS)
      .eq('source', 'recurring')
      .gte('recurring_month', fromMonth)
      .lte('recurring_month', toMonth)
      .order('recurring_month', { ascending: true })
  ))
}

/* ---------- 예산 (②, 0003 SQL) ---------- */

/** 그 달 예산. 없으면 그 전 가장 최근 예산을 기본값으로 (SPEC 5-5) → { amount, month, inherited } | null */
export async function getBudget(month01) {
  const rows = await guarded('v3', async () => check(
    await supabase.from('budgets').select('month, amount')
      .lte('month', month01).order('month', { ascending: false }).limit(1)
  ))
  const b = rows[0]
  if (!b) return null
  return { amount: b.amount, month: b.month, inherited: b.month !== month01 }
}

async function saveBudgetRaw(month01, amount) {
  return check(
    await supabase.from('budgets').upsert({ month: month01, amount }, { onConflict: 'user_id,month' }).select('month, amount').single()
  )
}

async function deleteBudgetRaw(month01) {
  return check(await supabase.from('budgets').delete().eq('month', month01))
}

/* ---------- 가게 이름 짝 (③, 0003 SQL) ---------- */

/** { '읽힌 이름': '고친 이름' } — 표가 없으면(SQL 전) 빈 짝 */
export async function listStoreAliases() {
  try {
    const data = await guarded('v3', async () =>
      check(await supabase.from('store_aliases').select('raw_name, display_name').limit(2000)))
    return Object.fromEntries(data.map((r) => [r.raw_name, r.display_name]))
  } catch (e) {
    if (!isMissingSetup(e)) console.warn('가게 이름 짝을 불러오지 못했어요', e)
    return {}
  }
}

export async function saveStoreAliases(pairs) {
  const rows = pairs.filter((p) => p.raw_name && p.display_name && p.raw_name !== p.display_name)
    .map((p) => ({ raw_name: p.raw_name.slice(0, 80), display_name: p.display_name.slice(0, 50) }))
  // 같은 읽힌 이름이 한 번에 두 번 들어가면 DB가 거부하므로 마지막 것만 남긴다
  const unique = [...new Map(rows.map((r) => [r.raw_name, r])).values()]
  if (!unique.length || missing.v3) return
  check(await supabase.from('store_aliases').upsert(unique, { onConflict: 'user_id,raw_name' }))
}

/** 같은 날짜·금액·가게 기록이 있는지 (중복 알림) → 겹치는 기록 목록 */
export async function findSameTransactions(dates) {
  if (!dates.length) return []
  return check(
    await supabase.from('transactions').select('id, date, amount, store_name, kind')
      .in('date', [...new Set(dates)])
  )
}

/** 여러 건 한 번에 저장 (캡처 확인 화면) */
async function saveTransactionsRaw(list) {
  const rows = list.map((tx) => ({
    kind: tx.kind, date: tx.date, amount: tx.amount, status: 'confirmed',
    store_name: tx.store_name || null, category_id: tx.category_id || null,
    payment_method_id: tx.payment_method_id || null, memo: tx.memo || null, source: tx.source || 'image'
  }))
  return check(await supabase.from('transactions').insert(rows).select('id'))
}

/* ---------- 주간 정리 알림 (④, 0003 SQL) ---------- */

/** 알림 설정. 표에 칸이 없으면(SQL 전) null */
export async function getRemindSettings() {
  try {
    const data = await guarded('v3', async () => check(await supabase.from('user_settings')
      .select('remind_enabled, remind_weekday, remind_time, remind_done_on').maybeSingle()))
    return data || { remind_enabled: false, remind_weekday: 0, remind_time: '21:00:00', remind_done_on: null }
  } catch (e) {
    if (!isMissingSetup(e)) console.warn('알림 설정을 불러오지 못했어요', e)
    return null
  }
}

export async function saveRemindSettings(patch) {
  return check(await supabase.from('user_settings').update(patch).not('user_id', 'is', null))
}

/* ---------- 저장·삭제 후 '바뀜' 알림 (sync.js) ---------- */
const changes = (fn) => async (...args) => { const r = await fn(...args); bump(); return r }
export const addPaymentMethod = changes(addPaymentMethodRaw)
export const saveTransaction = changes(saveTransactionRaw)
export const deleteTransaction = changes(deleteTransactionRaw)
export const updatePaymentMethod = changes(updatePaymentMethodRaw)
export const addCategory = changes(addCategoryRaw)
export const updateCategory = changes(updateCategoryRaw)
export const addQuickEntry = changes(addQuickEntryRaw)
export const updateQuickEntry = changes(updateQuickEntryRaw)
export const deleteQuickEntry = changes(deleteQuickEntryRaw)
export const saveOrder = changes(saveOrderRaw)
export const addRecurringItem = changes(addRecurringItemRaw)
export const updateRecurringItem = changes(updateRecurringItemRaw)
export const deleteRecurringItem = changes(deleteRecurringItemRaw)
export const generateRecurring = changes(generateRecurringRaw)
export const saveBudget = changes(saveBudgetRaw)
export const deleteBudget = changes(deleteBudgetRaw)
export const saveTransactions = changes(saveTransactionsRaw)
