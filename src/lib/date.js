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
