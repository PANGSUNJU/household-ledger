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
