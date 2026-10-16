/*
 * 고정 항목 (SPEC 5-4)
 *  · 날짜 규칙: 그 달의 day_of_month(없으면 말일) → 토·일이면 앞/뒤 평일
 *    DB 함수 public.recurring_date 와 같은 규칙이다. 둘을 함께 고칠 것.
 *  · 실제 기록은 DB(generate_recurring)가 만든다. 여기서는 화면에 보여줄 '예정'만 계산한다.
 */
import { reactive } from 'vue'
import { parse, format, daysInMonth, weekday, addMonths, addDays, todayKST } from './date'
import { generateRecurring } from './api'

/** 그 달(y, m) 회차의 실제 날짜 'YYYY-MM-DD' */
export function occurrenceDate(item, y, m) {
  const d = Math.min(item.day_of_month, daysInMonth(y, m))
  const base = format(y, m, d)
  const wd = weekday(y, m, d)
  if (wd === 6) return addDays(base, item.weekend_rule === 'before' ? -1 : 2)
  if (wd === 0) return addDays(base, item.weekend_rule === 'before' ? -2 : 1)
  return base
}

/** 항목이 그 날짜에 살아 있는지 (시작일·끝나는 날·그만둠) */
function alive(item, date) {
  return item.is_active && date >= item.start_date && (!item.end_date || date <= item.end_date)
}

/**
 * from~to 사이(둘 다 포함)에 날짜가 오는 회차 목록
 * 주말 규칙으로 앞/뒤 달로 넘어가는 회차도 잡으려고 앞뒤 한 달씩 넓게 본다.
 * → [{ item, date, month: 'YYYY-MM-01' }]
 */
export function occurrencesBetween(items, from, to) {
  const a = parse(from), b = parse(to)
  const out = []
  for (const item of items) {
    let cur = addMonths(a.y, a.m, -1)
    const end = addMonths(b.y, b.m, 1)
    while (cur.y * 12 + cur.m <= end.y * 12 + end.m) {
      const date = occurrenceDate(item, cur.y, cur.m)
      if (date >= from && date <= to && alive(item, date)) {
        out.push({ item, date, month: format(cur.y, cur.m, 1) })
      }
      cur = addMonths(cur.y, cur.m, 1)
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

/**
 * 아직 기록이 안 된 '예정' 회차: 오늘 다음 날 ~ to
 * (오늘까지는 앱을 열 때 DB가 이미 기록으로 만들었다)
 */
export function upcoming(items, from, to, today = todayKST()) {
  const start = from > today ? from : addDays(today, 1)
  if (start > to) return []
  return occurrencesBetween(items, start, to)
}

/** 다음 회차 날짜 (오늘 다음부터 1년 안) */
export function nextDate(item, today = todayKST()) {
  return occurrencesBetween([item], addDays(today, 1), addDays(today, 400))[0]?.date || null
}

/** '매달 25일 · 주말이면 앞 평일' */
export function scheduleText(item) {
  const day = item.day_of_month >= 31 ? '말일' : `${item.day_of_month}일`
  return `매달 ${day} · 주말이면 ${item.weekend_rule === 'before' ? '앞' : '뒤'} 평일`
}

/* ---------- 앱을 열 때 날짜가 된 회차를 기록으로 만들기 ---------- */

export const recurringState = reactive({ ready: false, lastRunDate: null, made: 0 })

/**
 * 하루에 한 번이면 충분하다. 실패해도(예: 0002 SQL을 아직 안 돌림) 앱은 그대로 쓴다.
 */
let running = null

export function runRecurring({ force = false } = {}) {
  const today = todayKST()
  if (!force && recurringState.lastRunDate === today) { recurringState.ready = true; return Promise.resolve(0) }
  if (running) return running
  running = (async () => {
    try {
      recurringState.made = (await generateRecurring()) || 0
      recurringState.lastRunDate = today
    } catch (e) {
      console.warn('고정 항목 자동 기록을 하지 못했어요', e)
    } finally {
      recurringState.ready = true
      running = null
    }
    return recurringState.made
  })()
  return running
}

export function resetRecurring() {
  recurringState.ready = false
  recurringState.lastRunDate = null
  recurringState.made = 0
}

/** 테이블이 아직 없을 때(0002 SQL 실행 전) Supabase가 주는 오류인지 */
export function isMissingSetup(e) {
  const code = e?.code || ''
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883' ||
    /recurring_items|generate_recurring/.test(e?.message || '') && /not find|does not exist/.test(e?.message || '')
}
