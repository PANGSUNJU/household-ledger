/* 금액은 원 단위 정수로만 다룬다. */

/** 12300 → '12,300' */
export function won(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return Math.round(n).toLocaleString('ko-KR')
}

/** 달력 칸용 짧은 금액: 10만 이상은 '만' 단위 (소수 첫째 자리까지, .0 은 뺌) → 53.9만, 320만, 1,234.6만 */
export function compact(n) {
  const a = Math.abs(n)
  if (a >= 100000) {
    const v = Math.round(a / 1000) / 10
    return v.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만'
  }
  return won(a)
}

/** 지출이면 '-12,300', 수입이면 '+9,200' */
export function signed(n, kind) {
  return (kind === 'income' ? '+' : '-') + won(Math.abs(n))
}

/** 금액 최댓값 10억 원 (DB 금액 칸은 약 21억까지라 넘으면 저장 오류가 난다) */
export const MAX_AMOUNT = 1000000000

/** 금액이 너무 큰지 (화면 안내용) */
export function tooBig(input) {
  const n = Number(String(input ?? '').replace(/[,\s원]/g, ''))
  return Number.isFinite(n) && n > MAX_AMOUNT
}

/**
 * 금액 칸 계산기 (SPEC 10-A)
 * '36000/3' → 12000, '4500+3200' → 7700, '12,300' → 12300
 * 숫자와 + - * / ( ) 만 허용한다. 계산할 수 없으면 null.
 * eval 을 쓰지 않고 직접 계산한다. 10억 원이 넘으면 null.
 */
export function calcAmount(input) {
  if (typeof input !== 'string') return null
  const src = input.replace(/[,\s원]/g, '').replace(/×/g, '*').replace(/÷/g, '/')
  if (!src) return null
  if (!/^[0-9+\-*/().]+$/.test(src)) return null

  let i = 0
  const peek = () => src[i]
  const take = () => src[i++]

  function number() {
    let s = ''
    while (i < src.length && /[0-9.]/.test(peek())) s += take()
    if (!s || (s.match(/\./g) || []).length > 1) throw new Error('bad number')
    return Number(s)
  }
  function factor() {
    if (peek() === '-') { take(); return -factor() }
    if (peek() === '(') {
      take()
      const v = expr()
      if (take() !== ')') throw new Error('missing )')
      return v
    }
    return number()
  }
  function term() {
    let v = factor()
    while (peek() === '*' || peek() === '/') {
      const op = take()
      const r = factor()
      if (op === '/' && r === 0) throw new Error('divide by zero')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function expr() {
    let v = term()
    while (peek() === '+' || peek() === '-') {
      const op = take()
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  try {
    const v = expr()
    if (i !== src.length || !Number.isFinite(v)) return null
    const n = Math.round(v)
    return Math.abs(n) > MAX_AMOUNT ? null : n
  } catch {
    return null
  }
}

/** 입력에 계산식(+ - * /)이 들어 있는지 — '= 12,000원' 표시 여부 */
export function hasOperator(input) {
  return typeof input === 'string' && /[0-9][+\-*/×÷]/.test(input.replace(/[,\s]/g, ''))
}
