/*
 * 이미지에서 읽은 글자 → 기록 후보로 바꾸기 (SPEC 5-7, 10-A)
 * 화면·DB와 상관없는 순수 함수만 둔다 (node 시험에서 바로 불러 쓴다)
 *
 *  parseCapture(text, today) : 카드·은행 앱 이용내역 캡처 → 여러 건
 *  parseReceipt(text, today) : 종이·전자 영수증 → 한 건 (+ 품목은 메모로)
 *
 *  · 카드번호·카드사는 읽지 않는다 (가게 이름·메모에 숫자 덩어리가 들어가지 않게 지운다)
 *  · 읽은 값은 모두 화면에서 고칠 수 있으니, 여기서는 '그럴듯한 값'을 채우는 것이 목표
 */

const pad = (n) => String(n).padStart(2, '0')

/** 글자 정리: 전각 문자 → 반각, 가운뎃점 통일, 빈칸 하나로 */
export function normalize(text) {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ㆍ•∙]/g, '·')
    .replace(/[−–—]/g, '-')
    .replace(/[ \t　]+/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** 'YYYY-MM-DD' 가 진짜 날짜인지 */
function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * 줄에서 날짜 찾기 → 'YYYY-MM-DD' | null
 * 연도가 없으면 올해, 그게 오늘보다 뒤면 작년으로 본다
 */
export function findDate(line, today, defaultYear = null) {
  const ty = Number(today.slice(0, 4))
  // 2026-10-15 / 2026.10.15 / 2026/10/15 / 2026년 10월 15일 / 26.10.15
  let m = line.match(/(?<!\d)(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/)
  if (m) {
    let y = Number(m[1])
    if (y < 100) y += 2000
    const d = validDate(y, Number(m[2]), Number(m[3]))
    if (d) return d
  }
  // 10월 15일
  m = line.match(/(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  // 10.15 (목) / 10/15 / 10.15
  if (!m) m = line.match(/(?<![\d,.:])(\d{1,2})[./](\d{1,2})(?![\d,]|\.\d)(?=\s*(\(|$|\s|[가-힣]))/)
  if (m) {
    const mo = Number(m[1]), dd = Number(m[2])
    let y = defaultYear || ty
    let d = validDate(y, mo, dd)
    if (d && d > today && !defaultYear) d = validDate(y - 1, mo, dd)
    if (d) return d
  }
  return null
}

/** '2026년 10월' 같은 머리글에서 연도 */
function findYear(lines) {
  for (const l of lines.slice(0, 8)) {
    const m = l.match(/(20\d{2})\s*년/)
    if (m) return Number(m[1])
  }
  return null
}

/** 숫자 글자 정리: 읽기 실수로 섞인 ; . 를 쉼표로 (12;300 → 12,300) */
function toNumber(s) {
  const n = Number(s.replace(/[,;.]/g, ''))
  return Number.isFinite(n) ? n : null
}

const AMOUNT_WON = /([+-])?\s?(\d{1,3}(?:[,;.]\d{3})+|\d{1,9})\s?원/g
const AMOUNT_BARE = /(^|\s)([+-])?(\d{1,3}(?:[,]\d{3})+)(?=\s*$|\s)/g

/** 줄 안의 금액들 → [{ sign, value, index, raw }] (원 표시가 있는 것 우선) */
export function findAmounts(line, { needWon = true } = {}) {
  const out = []
  for (const m of line.matchAll(AMOUNT_WON)) {
    const v = toNumber(m[2])
    if (v != null && v > 0) out.push({ sign: m[1] || '', value: v, index: m.index, raw: m[0] })
  }
  if (!out.length && !needWon) {
    for (const m of line.matchAll(AMOUNT_BARE)) {
      const v = toNumber(m[3])
      if (v != null && v > 0) out.push({ sign: m[2] || '', value: v, index: m.index + m[1].length, raw: m[0].trim() })
    }
  }
  return out
}

// 기록이 아닌 줄 (합계·잔액·한도 등)
const SKIP = /(잔액|누적|한도|포인트|적립|이용\s?금액|총\s?금액|합\s?계|결제\s?예정|청구|이번\s?달|출금\s?가능|사용\s?가능|명세서)/
// 가게 이름에서 빼는 말
const META_WORDS = /(일시불|할부\s?\d*\s?(개월)?|승인\s?취소|승인|결제\s?취소|취소|체크|신용|해외|국내|매입|가승인|\d+개월)/g
const CANCEL = /(취소|환불|반품)/
const TIME = /(?<!\d)\d{1,2}:\d{2}(:\d{2})?(?!\d)/g
const DATE_ANY = /(\d{2,4}\s*[.\-/년]\s*)?\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?(\s*\([^)]{1,3}\))?/g
const CARD_NO = /(\d[\d*xX＊-]{11,}\d|[*xX]{4}[\s-]?\d{4})/g

/** 가게 이름 다듬기 */
export function cleanStore(s) {
  return s
    .replace(CARD_NO, ' ')
    .replace(TIME, ' ')
    .replace(DATE_ANY, ' ')
    .replace(META_WORDS, ' ')
    .replace(/[·|>›»]/g, ' ')
    .replace(/^[\s\-–:,.]+|[\s\-–:,.]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 50)
}

/**
 * 카드·은행 앱 이용내역 캡처 → [{ date, store, amount, kind: 'expense'|'income'|'cancel', raw }]
 *  · 카드 앱: 부호 없는 금액 = 지출, '-' 이거나 '취소'가 붙으면 결제 취소
 *  · 은행 앱(+/- 가 붙음): '-' = 지출(출금), '+' = 입금
 *  · 날짜는 위쪽 날짜 머리글을 따른다. 날짜를 못 찾으면 오늘
 */
export function parseCapture(text, today) {
  const items = captureItems(text, today, true)
  // 날짜 머리글이 아예 없는 화면이면 날짜 없이 다시 (오늘 날짜로 채움)
  return items.length ? items : captureItems(text, today, false)
}

function captureItems(text, today, needDate) {
  const lines = normalize(text)
  const year = findYear(lines)
  const all = lines.map((l) => ({ l, amounts: SKIP.test(l) ? [] : findAmounts(l), date: findDate(l, today, year) }))
  const signed = all.flatMap((x) => x.amounts).filter((a) => a.sign)
  const bankStyle = signed.some((a) => a.sign === '+') || (signed.length >= 2 && signed.length >= all.filter((x) => x.amounts.length).length / 2)

  const items = []
  let curDate = null
  for (let i = 0; i < all.length; i++) {
    const { l, amounts, date } = all[i]
    if (date && !amounts.length) { curDate = date; continue }
    if (date) curDate = date
    if (!amounts.length) continue
    // 첫 날짜 머리글 위쪽(계좌 잔액·카드 이름 등)은 기록이 아니다
    if (needDate && !curDate) continue

    const a = amounts[amounts.length - 1]   // 줄 맨 오른쪽 금액
    let store = cleanStore(l.slice(0, a.index) + ' ' + l.slice(a.index + a.raw.length))
    // 가게 이름이 비면 바로 윗줄 (날짜·금액 없는 줄)
    if (!store && i > 0 && !all[i - 1].amounts.length && !all[i - 1].date) {
      const prev = cleanStore(all[i - 1].l)
      if ((prev.match(/[가-힣A-Za-z0-9]/g) || []).length >= 2) store = prev
    }

    // 아랫줄들(다음 금액·날짜 줄 전까지)에 '취소'가 있는지
    let ctx = l
    for (let j = i + 1; j < all.length && !all[j].amounts.length && !all[j].date; j++) ctx += ' ' + all[j].l

    let kind = 'expense'
    if (bankStyle) kind = a.sign === '+' ? 'income' : 'expense'
    else if (a.sign === '-') kind = 'cancel'
    if (CANCEL.test(ctx)) kind = 'cancel'

    items.push({ date: curDate || today, store, amount: a.value, kind, raw: l })
  }
  return items
}

// 영수증: 합계 줄 (앞에 있는 것이 우선)
const TOTAL_KEYS = [/취소\s?합\s?계/, /합\s?계/, /결제\s?금액/, /받을\s?금액/, /총\s?(금\s?)?액/, /승인\s?금액/, /카드\s?(결제|취소)/, /청구\s?금액/, /판매\s?금액/]
const RECEIPT_NOISE = /(영수증|매출\s?전표|고객용|가맹점용|사업자|대표|TEL|전화|주소|POS|번호|품명|상품명|수량|단가|금액|부가세|과세|면세|봉사료|\[.*\]|감사합니다|교환|환불은|카드사|승인)/i
const STRONG_CANCEL = /(\[\s*취\s*소\s*\]|취소\s?합계|카드\s?취소|결제\s?취소|취소\s?영수증|반품|환불\s?영수증)/

/**
 * 영수증 → { date, store, amount, canceled, items: ['우유 1L', …], memo }
 */
export function parseReceipt(text, today) {
  const lines = normalize(text)
  const joined = lines.join('\n')

  let date = null
  for (const l of lines) { date = findDate(l, today); if (date) break }

  // 가게: '상호/가맹점명: OOO' 가 있으면 그것, 없으면 맨 위 쪽 이름다운 줄
  let store = ''
  for (const l of lines) {
    const m = l.match(/(상호|가맹점\s?명?|매장\s?명?)\s*[:：]?\s*(.+)/)
    if (m && cleanStore(m[2])) { store = cleanStore(m[2]); break }
  }
  if (!store) {
    for (const l of lines.slice(0, 6)) {
      if (RECEIPT_NOISE.test(l) || findDate(l, today) || findAmounts(l, { needWon: false }).length) continue
      const c = cleanStore(l)
      if ((c.match(/[가-힣A-Za-z]/g) || []).length >= 2) { store = c; break }
    }
  }

  // 합계
  let amount = null, totalLine = -1
  for (const key of TOTAL_KEYS) {
    const idx = lines.findIndex((l) => key.test(l) && findAmounts(l, { needWon: false }).length)
    if (idx >= 0) {
      const as = findAmounts(lines[idx], { needWon: false })
      amount = as[as.length - 1].value
      totalLine = idx
      break
    }
  }
  if (amount == null) {
    const every = lines.flatMap((l) => (SKIP.test(l) && !/합\s?계/.test(l) ? [] : findAmounts(l, { needWon: false })))
    amount = every.length ? Math.max(...every.map((a) => a.value)) : null
  }

  // 품목: 머리글(상품명/첫 날짜) 아래 ~ 합계 줄 위, '이름 … 금액' 모양
  const startIdx = Math.max(lines.findIndex((l) => /(상품명|품명|품목)/.test(l)), 0)
  const endIdx = totalLine > 0 ? totalLine : lines.length
  const items = []
  for (let i = startIdx + 1; i < endIdx; i++) {
    const l = lines[i]
    const as = findAmounts(l, { needWon: false })
    if (!as.length || RECEIPT_NOISE.test(l) || findDate(l, today)) continue
    const name = cleanStore(l.slice(0, as[0].index).replace(/\s\d{1,3}\s*$/, ''))   // 끝의 수량 빼기
    if ((name.match(/[가-힣A-Za-z]/g) || []).length >= 1) items.push(name)
  }

  const canceled = STRONG_CANCEL.test(joined) || /(^|\s)-\s?\d{1,3}(,\d{3})+/.test(lines[totalLine] || '')
  const memo = items.length ? ('품목: ' + items.join(', ')).slice(0, 200) : ''
  return { date: date || today, store, amount, canceled, items, memo }
}

/* ---------- 분류 짐작 (같은 가게 기록이 없을 때만) ---------- */

const GUESS = [
  [/(커피|카페|스타벅스|메가|이디야|빽다방|투썸|컴포즈|할리스|폴바셋|베이커리|파리바게|뚜레쥬르|배스킨|던킨)/, '카페·간식'],
  [/(배달의민족|배민|요기요|쿠팡이츠|식당|김밥|국밥|치킨|피자|버거|맥도날드|롯데리아|분식|한식|중식|일식|고기)/, '식비'],
  [/(GS25|CU|세븐일레븐|이마트24|편의점|미니스톱)/i, '식비'],
  [/(다이소|이마트|홈플러스|롯데마트|마트|올리브영|약국)/, '생활용품'],
  [/(택시|카카오T|버스|지하철|교통|코레일|KTX|SRT|주유|충전소|하이패스|티머니)/i, '교통'],
  [/(쿠팡|무신사|지그재그|11번가|G마켓|옥션|네이버페이|에이블리|29CM)/i, '쇼핑'],
  [/(CGV|메가박스|롯데시네마|넷플릭스|유튜브|멜론|티빙|왓챠|교보문고|yes24|알라딘)/i, '문화·여가'],
  [/(관리비|통신|보험|월세|가스|전기|수도|KT|SKT|LG유플러스)/i, '고정지출']
]

/** 가게 이름으로 분류 이름 짐작 → '카페·간식' | null */
export function guessCategoryName(store) {
  for (const [re, name] of GUESS) if (re.test(store || '')) return name
  return null
}
