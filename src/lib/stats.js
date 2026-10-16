/*
 * 통계 계산 (SPEC 7장)
 *  · 쓴 돈 = 지출(저축/투자 제외) − 환불
 *  · 분류별 = 그 분류 지출 − 그 분류에서 빼기로 한 환불
 *  · 수입 = 수입 중 환불 제외
 *  · 확정(confirmed) 기록만, 금액 입력 필요 상태는 넣지 않음
 */

export function summarize(txs) {
  let spent = 0, savings = 0, income = 0
  const byCategory = new Map()  // id → { name, color, amount }
  const byStore = new Map()
  const byMethod = new Map()

  const add = (map, key, name, value, extra = {}) => {
    const cur = map.get(key) || { name, amount: 0, ...extra }
    cur.amount += value
    map.set(key, cur)
  }

  for (const t of txs) {
    if (t.status !== 'confirmed' || t.amount == null) continue
    const isRefund = t.kind === 'income' && t.category?.is_refund

    if (t.kind === 'expense') {
      if (t.category?.is_savings) { savings += t.amount; continue }
      spent += t.amount
      add(byCategory, t.category_id || 'none', t.category?.name || '미분류', t.amount, { color: t.category?.color })
      add(byStore, t.store_name || '(가게 없음)', t.store_name || '(가게 없음)', t.amount)
      add(byMethod, t.payment_method_id || 'none', t.payment_method?.name || '미지정', t.amount)
    } else if (isRefund) {
      spent -= t.amount
      add(byCategory, t.refund_category_id || 'none', '', -t.amount)
      add(byStore, t.store_name || '(가게 없음)', t.store_name || '(가게 없음)', -t.amount)
      add(byMethod, t.payment_method_id || 'none', t.payment_method?.name || '미지정', -t.amount)
    } else {
      income += t.amount
    }
  }

  const sorted = (map) => [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter((v) => v.amount !== 0)
    .sort((a, b) => b.amount - a.amount)

  return { spent, savings, income, byCategory: sorted(byCategory), byStore: sorted(byStore), byMethod: sorted(byMethod) }
}

/** 날짜별 합계 (캘린더용): { 'YYYY-MM-DD': { spent, top: '다이소', count } } */
export function byDay(txs) {
  const days = {}
  for (const t of txs) {
    if (t.status !== 'confirmed' || t.amount == null) continue
    const d = (days[t.date] ||= { spent: 0, income: 0, count: 0, top: null, topAmount: 0, topIsExpense: false })
    d.count += 1
    const name = t.store_name || t.category?.name || (t.kind === 'expense' ? '지출' : '수입')
    if (t.kind === 'expense') {
      d.spent += t.amount
      // 칸에 보일 이름: 그날 가장 큰 지출 (지출이 없으면 수입)
      if (!d.topIsExpense || t.amount > d.topAmount) { d.topAmount = t.amount; d.top = name; d.topIsExpense = true }
    } else {
      if (t.category?.is_refund) d.spent -= t.amount
      else d.income += t.amount
      if (!d.topIsExpense && t.amount > d.topAmount) { d.topAmount = t.amount; d.top = name }
    }
  }
  return days
}
