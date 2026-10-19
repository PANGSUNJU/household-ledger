/*
 * 날짜는 모두 "한국 날짜" 문자열(YYYY-MM-DD)로만 다룬다.
 * new Date().toISOString() 은 세계 표준시라서 한국 시간 0~9시에 하루 전 날짜가 나온다.
 * → 날짜 계산은 반드시 이 파일의 함수만 쓴다. (SPEC 10-D)
 */

const KST = 'Asia/Seoul'

/** 지금 한국 날짜 'YYYY-MM-DD' */
export function todayKST() {
  // en-CA 형식이 YYYY-MM-DD 로 나온다
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

/** 'YYYY-MM-DD' → { y, m, d } (m: 1~12) */
export function parse(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y, m, d }
}

/** { y, m, d } → 'YYYY-MM-DD' */
export function format(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 그 달의 날 수 */
export function daysInMonth(y, m) {
  // 시간대 영향을 받지 않도록 UTC 로만 계산
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 요일 (0=일 ~ 6=토) */
export function weekday(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 달 이동: addMonths(2026, 10, -1) → { y: 2026, m: 9 } */
export function addMonths(y, m, diff) {
  const total = y * 12 + (m - 1) + diff
  return { y: Math.floor(total / 12), m: (total % 12) + 1 }
}

/** 날짜 더하기: addDays('2026-10-16', -90) → '2026-07-18' */
export function addDays(dateStr, diff) {
  const { y, m, d } = parse(dateStr)
  const t = new Date(Date.UTC(y, m - 1, d + diff))
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** 이번 달 1일 ~ 오늘 (통계 기본 기간) */
export function thisMonthRange() {
  const t = todayKST()
  const { y, m } = parse(t)
  return { from: format(y, m, 1), to: t }
}

/** 지난달 같은 기간 (예: 10/1~10/16 → 9/1~9/16, 9월에 없는 날이면 말일까지) */
export function sameRangeLastMonth(from, to) {
  const a = parse(from)
  const b = parse(to)
  const pa = addMonths(a.y, a.m, -1)
  const pb = addMonths(b.y, b.m, -1)
  return {
    from: format(pa.y, pa.m, Math.min(a.d, daysInMonth(pa.y, pa.m))),
    to: format(pb.y, pb.m, Math.min(b.d, daysInMonth(pb.y, pb.m)))
  }
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

/** '2026-10-16' → '10월 16일 (금)' */
export function label(dateStr) {
  const { y, m, d } = parse(dateStr)
  return `${m}월 ${d}일 (${WEEK[weekday(y, m, d)]})`
}

/** 두 날짜 사이 날 수 (둘 다 포함): daysBetween('2026-10-01', '2026-10-16') → 16 */
export function daysBetween(from, to) {
  const a = parse(from), b = parse(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1
}

/**
 * 통계 기간 빠른 선택 (SPEC 5-3) → { from, to, cmp: { from, to }, cmpLabel }
 *  · this: 이번 달 1일~오늘 ↔ 지난달 같은 기간
 *  · last: 지난달 1일~말일 ↔ 그 전달 전체
 *  · d30 : 최근 30일 ↔ 그 앞 30일
 *  · custom: 고른 기간 ↔ 바로 앞 같은 길이
 */
export function statsRange(kind, custom = null) {
  const t = todayKST()
  const { y, m } = parse(t)
  if (kind === 'last') {
    const p = addMonths(y, m, -1), pp = addMonths(y, m, -2)
    return {
      from: format(p.y, p.m, 1), to: format(p.y, p.m, daysInMonth(p.y, p.m)),
      cmp: { from: format(pp.y, pp.m, 1), to: format(pp.y, pp.m, daysInMonth(pp.y, pp.m)) },
      cmpLabel: '그 전달'
    }
  }
  if (kind === 'd30') {
    const from = addDays(t, -29)
    return { from, to: t, cmp: { from: addDays(from, -30), to: addDays(from, -1) }, cmpLabel: '그 앞 30일' }
  }
  // 올해: 1월 1일~오늘 (작년 같은 기간과 비교)
  if (kind === 'year') {
    const from = format(y, 1, 1)
    const p = parse(t)
    const lastTo = format(y - 1, p.m, Math.min(p.d, daysInMonth(y - 1, p.m)))
    return { from, to: t, cmp: { from: format(y - 1, 1, 1), to: lastTo }, cmpLabel: '작년 같은 기간' }
  }
  if (kind === 'custom' && custom?.from && custom?.to) {
    const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from]
    const n = daysBetween(from, to)
    return { from, to, cmp: { from: addDays(from, -n), to: addDays(from, -1) }, cmpLabel: `바로 앞 ${n}일` }
  }
  const from = format(y, m, 1)
  return { from, to: t, cmp: sameRangeLastMonth(from, t), cmpLabel: '지난달 같은 기간' }
}

/** 기간 표시: '10월 1일~16일', '9월 20일~10월 19일', '2025년 12월 1일~2026년 1월 5일' */
export function rangeText(from, to) {
  const a = parse(from), b = parse(to)
  const today = parse(todayKST())
  const yA = a.y !== today.y || a.y !== b.y ? `${a.y}년 ` : ''
  const yB = a.y !== b.y ? `${b.y}년 ` : ''
  if (from === to) return `${yA}${a.m}월 ${a.d}일`
  if (a.y === b.y && a.m === b.m) return `${yA}${a.m}월 ${a.d}일~${b.d}일`
  return `${yA}${a.m}월 ${a.d}일~${yB}${b.m}월 ${b.d}일`
}
