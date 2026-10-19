/*
 * CSV 내보내기 (SPEC 5-6)
 *  · 열: 날짜, 종류, 금액, 가게, 분류, 결제수단, 메모 (+ 상태)
 *  · 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM(﻿)을 붙인다
 *  · 엑셀이 = + - @ 로 시작하는 글을 수식으로 실행하지 않게 앞에 ' 를 붙인다
 */

const HEAD = ['날짜', '종류', '금액', '사용처·입금처', '분류', '결제수단', '메모', '상태']

function cell(v, { text = false } = {}) {
  let s = v == null ? '' : String(v)
  if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(txs) {
  const lines = [HEAD.join(',')]
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    const isRefund = t.kind === 'income' && t.category?.is_refund
    lines.push([
      cell(t.date),
      cell(isRefund ? '환불' : t.kind === 'expense' ? '지출' : '수입'),
      cell(t.amount),
      cell(t.store_name, { text: true }),
      cell(t.category?.name || '미분류', { text: true }),
      cell(t.payment_method?.name || '미지정', { text: true }),
      cell(t.memo, { text: true }),
      cell(t.status === 'needs_amount' ? '금액 입력 필요' : '')
    ].join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** 파일로 내려받기 */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
