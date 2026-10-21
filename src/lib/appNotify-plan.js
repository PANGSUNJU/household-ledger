/*
 * 앱 알림 계획 (화면·폰과 상관없는 계산만 — node 시험에서 바로 씀)
 *  · 고정 수입·지출: 그날 아침 9시, 같은 날 여러 건이면 한 알림으로
 *  · 주간 정리: 설정한 요일·시간에 매주
 */

export const NOTIFY_HOUR = 9
export const RECURRING_DAYS = 35   // 앱을 열 때마다 앞으로 35일 치를 다시 예약
export const WEEKLY_COUNT = 5      // 주간 알림은 앞으로 5번
export const ID_WEEKLY = 1000      // 1000~1099
export const ID_RECURRING = 2000   // 2000~2999

const won = (n) => Number(n).toLocaleString('ko-KR')
const at = (dateStr, h, m) => { const [y, mo, d] = dateStr.split('-').map(Number); return new Date(y, mo - 1, d, h, m, 0, 0) }

/**
 * occs: [{ item: { kind, name, amount }, date: 'YYYY-MM-DD' }] (recurring.js occurrencesBetween 결과)
 * now: Date — 이미 지난 시각은 빼고
 * → [{ id, title, body, at: Date, extra: { url } }]
 */
export function planRecurring(occs, now) {
  const byDate = new Map()
  for (const o of occs) {
    if (!byDate.has(o.date)) byDate.set(o.date, [])
    byDate.get(o.date).push(o.item)
  }
  const out = []
  let id = ID_RECURRING
  for (const [date, items] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const when = at(date, NOTIFY_HOUR, 0)
    if (when <= now) continue
    const exp = items.filter((i) => i.kind === 'expense'), inc = items.filter((i) => i.kind === 'income')
    const line = (i) => `${i.name} ${i.amount ? won(i.amount) + '원' : '(금액 미정)'}`
    let title, body
    if (items.length === 1) {
      const i = items[0]
      title = i.kind === 'income' ? '오늘 고정 수입이 들어와요' : '오늘 고정 지출이 나가요'
      body = line(i)
    } else {
      title = `오늘 고정 ${exp.length ? `지출 ${exp.length}건` : ''}${exp.length && inc.length ? ' · ' : ''}${inc.length ? `수입 ${inc.length}건` : ''}`
      body = [...exp, ...inc].map(line).join(', ')
    }
    out.push({ id: id++, title, body, at: when, extra: { url: '/' } })
    if (id >= ID_RECURRING + 999) break
  }
  return out
}

/**
 * s: { remind_enabled, remind_weekday (0=일), remind_time 'HH:MM:SS' }
 * → 다음 주간 정리 알림들
 */
export function planWeekly(s, now) {
  if (!s || !s.remind_enabled) return []
  const [hh, mm] = String(s.remind_time || '21:00').split(':').map(Number)
  const out = []
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
  let k = 0
  while (out.length < WEEKLY_COUNT && k < 60) {
    if (d.getDay() === s.remind_weekday && d > now) {
      out.push({
        id: ID_WEEKLY + out.length,
        title: '가계부 정리할 시간이에요',
        body: '이번 주 카드 앱 이용내역을 캡처해서 한 번에 정리해요.',
        at: new Date(d),
        extra: { url: '/capture' }
      })
    }
    d.setDate(d.getDate() + 1); k++
  }
  return out
}
