/*
 * 금액 칸에 쓰는 동안 세 자리마다 쉼표 넣기 (예: 1500000 → 1,500,000)
 *  · 계산식도 숫자마다 넣는다: 36000/3 → 36,000/3
 *  · 소수점 뒤 숫자는 그대로 둔다 (1.5)
 *  · 쉼표는 보기용. 금액 계산(calcAmount)은 쉼표를 빼고 읽는다
 *  · v-comma 를 input 에 붙이면 된다 (v-model 과 같이 써도 됨)
 */

/** 글자 안 숫자 덩어리에 쉼표 넣기 */
export function withCommas(text) {
  if (text === null || text === undefined) return ''
  return String(text).replace(/(\.?)([\d,]+)/g, (all, dot, run) => {
    const digits = run.replace(/,/g, '')
    if (!digits) return dot + run
    if (dot) return dot + digits   // 소수점 뒤
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  })
}

/** 커서 앞에 있던 '쉼표가 아닌 글자 수'를 지키면서 바꾼 뒤의 커서 위치 */
function caretAfter(newText, keep) {
  let n = 0
  for (let i = 0; i < newText.length; i++) {
    if (n === keep) return i
    if (newText[i] !== ',') n++
  }
  return newText.length
}

function format(el) {
  const old = el.value
  const next = withCommas(old)
  if (next === old) return
  const focused = document.activeElement === el
  const pos = el.selectionStart ?? old.length
  const keep = old.slice(0, pos).replace(/,/g, '').length
  el.value = next
  if (focused) {
    const p = caretAfter(next, keep)
    try { el.setSelectionRange(p, p) } catch { /* 지원 안 하는 칸 */ }
  }
  // v-model 이 쉼표 넣은 값을 받도록 한 번 더 알린다 (값이 같으면 여기서 멈춘다)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export const commaDirective = {
  mounted(el) {
    el._commaInput = (e) => { if (!e.isComposing) format(el) }
    el.addEventListener('input', el._commaInput)
    if (el.value) format(el)
  },
  // 코드에서 값을 넣은 경우(수정 화면 열기 등)에도 쉼표
  updated(el) { if (el.value && withCommas(el.value) !== el.value) format(el) },
  beforeUnmount(el) { el.removeEventListener('input', el._commaInput) }
}
