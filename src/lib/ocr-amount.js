/*
 * 금액 다시 읽기 (A안): 첫 번째 읽기에서 줄마다 맨 오른쪽 금액 자리를 찾아,
 * 그 부분만 '숫자·쉼표·원'만 읽게 다시 읽어 바꿔 넣는다.
 * 화면 없이 계산만 하는 부분은 여기 두고 node 시험에서 바로 쓴다.
 */

/** tesseract 결과(blocks) → 줄 목록 */
export function flatLines(blocks) {
  const out = []
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) out.push(l)
  return out
}

// 금액을 이루는 글자 (잘못 읽힌 모양 포함: ; ? ¢ / 등)
const AMOUNT_CHARS = /^[\d,.;:?'원윈¢/|+\-~]+$/

/**
 * 줄의 맨 오른쪽 금액 자리 { box, parts } (아니면 null)
 *  · 오른쪽 끝에서부터 금액 글자로만 된 낱말을, 사이가 가까우면(글자 높이쯤) 이어 붙인다
 *    ('1,780' + '원', '9' + '660원', '-' + '/200원' 처럼 잘게 나뉘어 읽혀도 한 덩어리로)
 *  · 가게 이름 끝 숫자('택시_8')는 금액과 멀리 떨어져 있어서 안 붙는다
 *  · 숫자가 2개 이상, 시간(18:43)·날짜(2026.10.19) 아님
 */
export function amountBox(line) {
  const words = (line.words || []).filter((w) => w.text && w.text.trim()).slice().sort((a, b) => a.bbox.x0 - b.bbox.x0)
  if (!words.length) return null
  const h = Math.max(1, line.bbox.y1 - line.bbox.y0)
  const got = []
  for (let k = words.length - 1; k >= 0; k--) {
    const w = words[k]
    if (!AMOUNT_CHARS.test(w.text.trim())) break
    if (got.length && got[0].bbox.x0 - w.bbox.x1 > Math.max(h * 0.8, 24)) break
    got.unshift(w)
  }
  if (!got.length) return null
  const tok = got.map((w) => w.text.trim()).join('')
  if ((tok.match(/\d/g) || []).length < 2) return null
  if (/\d:\d|\d{4}[.\-/]\d|^\d{1,2}[.\-/]\d{1,2}$/.test(tok)) return null
  const box = {
    x0: Math.min(...got.map((w) => w.bbox.x0)), x1: Math.max(...got.map((w) => w.bbox.x1)),
    y0: Math.min(line.bbox.y0, ...got.map((w) => w.bbox.y0)), y1: Math.max(line.bbox.y1, ...got.map((w) => w.bbox.y1))
  }
  return { box, parts: got.map((w) => w.text.trim()) }
}

/**
 * 다시 읽은 글자 → '7,200원' 꼴이면 돌려주고, 아니면 null
 * (부호는 다시 읽은 쪽을 믿지 않는다: 취소선이 '-' 로 읽힐 수 있어서)
 */
export function cleanReread(s) {
  const t = (s || '').replace(/\s/g, '').replace(/^[+\-~]+/, '').replace(/[.;]/g, ',')
  if (/^\d{1,3}(,\d{3})+원$/.test(t) || /^\d{1,4}원$/.test(t)) return t
  return null
}

/** 원래 줄 글자에서 금액 부분(parts)을 새 금액으로 바꾼다. 부호는 원래 것을 쓴다 */
export function replaceAmount(text, parts, amount) {
  const last = parts[parts.length - 1]
  const end = text.lastIndexOf(last)
  if (end < 0) return text
  let start = end
  if (parts.length > 1) {
    const s = text.lastIndexOf(parts[0], end)
    if (s >= 0) start = s
  }
  const sign = (parts[0].match(/^[+\-]/) || [''])[0]
  return text.slice(0, start) + sign + amount + text.slice(end + last.length)
}

/**
 * 원래 금액과 다시 읽은 금액 중 어느 것을 쓸지
 *  · 원래 읽은 게 멀쩡한 금액 모양(7,200원)이면 그대로 (다시 읽기가 부호 '-' 를 7 로 읽는 일이 있어서)
 *  · 원래 것이 깨졌을 때만(?,000원 / 4,500¢ / 9?660원 / -/200원) 다시 읽은 금액을 쓴다
 */
export function pickAmount(parts, reread) {
  if (!reread) return null
  if (cleanReread(parts.join(''))) return null
  return reread
}

// ---------------------------------------------------------------------------
// 날짜 다시 읽기: 줄 맨 앞 '2026.09.2?' 처럼 모양이 깨진 날짜만 숫자·점·쌍점으로 다시 읽는다

const DATE_CHARS = /^[\d.,:;?%/\-]+$/
const GOOD_DATE = /^(19|20)\d\d[.\-/][01]\d[.\-/][0-3]\d$/

/** 줄 맨 앞이 깨진 날짜면 그 자리 { box, parts } (멀쩡하면 null) */
export function dateBox(line) {
  const words = (line.words || []).filter((w) => w.text && w.text.trim()).slice().sort((a, b) => a.bbox.x0 - b.bbox.x0)
  if (!words.length) return null
  const first = words[0].text.trim()
  if (!/^(19|20)\d\d/.test(first) || !DATE_CHARS.test(first) || GOOD_DATE.test(first)) return null
  const h = Math.max(1, line.bbox.y1 - line.bbox.y0)
  const got = [words[0]]
  for (let k = 1; k < words.length && got.length < 3; k++) {
    const w = words[k]
    if (!DATE_CHARS.test(w.text.trim()) || w.bbox.x0 - got[got.length - 1].bbox.x1 > Math.max(h * 0.8, 24)) break
    got.push(w)
  }
  const box = {
    x0: Math.min(...got.map((w) => w.bbox.x0)), x1: Math.max(...got.map((w) => w.bbox.x1)),
    y0: Math.min(line.bbox.y0, ...got.map((w) => w.bbox.y0)), y1: Math.max(line.bbox.y1, ...got.map((w) => w.bbox.y1))
  }
  return { box, parts: got.map((w) => w.text.trim()) }
}

/** 다시 읽은 날짜 → '2026.09.29 11:45' (또는 시간 없이 '2026.09.29'), 아니면 null */
export function cleanDate(s) {
  const t = (s || '').replace(/\s/g, '').replace(/[,;]/g, '.')
  const m = t.match(/^((?:19|20)\d\d)[.\-/]?([01]\d)[.\-/]?([0-3]\d)(?:([0-2]\d):?([0-5]\d))?$/)
  if (!m) return null
  const [, y, mo, d, hh, mm] = m
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
  return `${y}.${mo}.${d}` + (hh ? ` ${hh}:${mm}` : '')
}

/** 줄 글자 맨 앞의 깨진 날짜 부분(parts)을 새 날짜로 */
export function replaceDate(text, parts, date) {
  const start = text.indexOf(parts[0])
  if (start < 0) return text
  const lastPart = parts[parts.length - 1]
  const e = text.indexOf(lastPart, start + (parts.length > 1 ? parts[0].length : 0))
  const end = (parts.length > 1 && e >= 0 ? e : start) + lastPart.length
  return text.slice(0, start) + date + text.slice(end)
}
