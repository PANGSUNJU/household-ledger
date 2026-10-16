/*
 * 데이터 읽기·저장은 모두 이 파일을 거친다. (SPEC 10-D: 저장 코드는 한곳에)
 * 나중에 오프라인 입력(v2)을 붙일 때 이 파일만 고치면 된다.
 */
import { supabase } from './supabase'
import { format, daysInMonth } from './date'

function check({ data, error }) {
  if (error) throw error
  return data
}

/* ---------- 분류 ---------- */

export async function listCategories({ includeHidden = false } = {}) {
  let q = supabase.from('categories').select('*').order('kind').order('sort_order')
  if (!includeHidden) q = q.eq('is_active', true)
  return check(await q)
}

/* ---------- 결제수단 ---------- */

export async function listPaymentMethods({ includeHidden = false } = {}) {
  let q = supabase.from('payment_methods').select('*').order('sort_order')
  if (!includeHidden) q = q.eq('is_active', true)
  return check(await q)
}

/** 결제수단 새로 등록 (입력 화면에서 바로) */
export async function addPaymentMethod({ type, name }) {
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

/** 기간 안의 기록 (from, to 모두 포함, 'YYYY-MM-DD') */
export async function listTransactions(from, to) {
  return check(
    await supabase
      .from('transactions')
      .select(TX_FIELDS)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
  )
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

/** 기록 저장 (id 가 있으면 수정) */
export async function saveTransaction(tx) {
  const row = {
    kind: tx.kind,
    date: tx.date,
    amount: tx.amount,
    store_name: tx.store_name || null,
    category_id: tx.category_id || null,
    payment_method_id: tx.payment_method_id || null,
    refund_of_id: tx.refund_of_id || null,
    refund_category_id: tx.refund_category_id || null,
    memo: tx.memo || null,
    source: tx.source || 'manual'
  }
  const q = tx.id
    ? supabase.from('transactions').update(row).eq('id', tx.id)
    : supabase.from('transactions').insert(row)
  return check(await q.select('id').single())
}

export async function deleteTransaction(id) {
  return check(await supabase.from('transactions').delete().eq('id', id))
}

/* ---------- 검색 (내역 화면) ---------- */

/** 가게·메모로 검색, 숫자만 넣으면 금액도 같이 찾기 (최근 200건) */
export async function searchTransactions(text) {
  const q = text.trim()
  const digits = q.replace(/[,\s원]/g, '')
  // PostgREST or() 문법에 쓰이는 기호는 빼서 안전하게
  const safe = q.replace(/[(),*%\\]/g, ' ').trim()
  const conds = []
  if (safe) conds.push(`store_name.ilike.*${safe}*`, `memo.ilike.*${safe}*`)
  if (/^\d+$/.test(digits)) conds.push(`amount.eq.${digits}`)
  if (!conds.length) return []
  return check(
    await supabase.from('transactions').select(TX_FIELDS)
      .or(conds.join(','))
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(200)
  )
}

/* ---------- 관리: 결제수단 ---------- */

export async function updatePaymentMethod(id, patch) {
  return check(await supabase.from('payment_methods').update(patch).eq('id', id).select('*').single())
}

/* ---------- 관리: 분류 ---------- */

export async function addCategory({ kind, name, color }) {
  const { data: last } = await supabase.from('categories').select('sort_order')
    .eq('kind', kind).order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(await supabase.from('categories').insert({ kind, name: name.trim(), color, sort_order }).select('*').single())
}

export async function updateCategory(id, patch) {
  return check(await supabase.from('categories').update(patch).eq('id', id).select('*').single())
}

/* ---------- 관리: 자주 쓰는 내역 ---------- */

export async function addQuickEntry({ name, amount, category_id, payment_method_id }) {
  const { data: last } = await supabase.from('quick_entries').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? 0) + 1
  return check(await supabase.from('quick_entries')
    .insert({ name: name.trim(), amount, category_id: category_id || null, payment_method_id: payment_method_id || null, sort_order })
    .select('*').single())
}

export async function updateQuickEntry(id, patch) {
  return check(await supabase.from('quick_entries').update(patch).eq('id', id).select('*').single())
}

export async function deleteQuickEntry(id) {
  return check(await supabase.from('quick_entries').delete().eq('id', id))
}

/** 순서 바꾸기: 목록 전체의 sort_order 를 다시 매긴다 (table: 'payment_methods' | 'categories' | 'quick_entries') */
export async function saveOrder(table, ids) {
  await Promise.all(ids.map((id, i) =>
    supabase.from(table).update({ sort_order: i + 1 }).eq('id', id).then(check)))
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

export async function setLockTimeout(seconds) {
  return check(await supabase.from('user_settings').update({ lock_timeout: seconds }).not('user_id', 'is', null))
}
