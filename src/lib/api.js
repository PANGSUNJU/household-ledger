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
