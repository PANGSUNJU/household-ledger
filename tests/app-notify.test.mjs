// 앱 알림 계획 시험
import { planRecurring, planWeekly, ID_RECURRING, ID_WEEKLY } from '../src/lib/appNotify-plan.js'
let pass = 0, fail = 0
const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ← ' + i)) }
const now = new Date(2026, 9, 21, 13, 0)   // 2026-10-21(수) 13:00
const E = (name, amount) => ({ kind: 'expense', name, amount }), I = (name, amount) => ({ kind: 'income', name, amount })
const r = planRecurring([
  { item: E('넷플릭스', 17000), date: '2026-10-21' },          // 오늘 9시는 지남 → 뺌
  { item: E('월세', 500000), date: '2026-10-25' },
  { item: E('통신비', null), date: '2026-10-25' },
  { item: I('월급', 3200000), date: '2026-10-25' },
  { item: E('보험', 54000), date: '2026-11-03' }
], now)
ok('오늘 이미 지난 9시는 빼고 2개', r.length === 2, JSON.stringify(r))
ok('같은 날 여러 건은 한 알림', r[0].title === '오늘 고정 지출 2건 · 수입 1건' && r[0].body === '월세 500,000원, 통신비 (금액 미정), 월급 3,200,000원', JSON.stringify(r[0]))
ok('그날 아침 9시', r[0].at.getHours() === 9 && r[0].at.getDate() === 25 && r[0].at.getMonth() === 9)
ok('한 건이면 이름·금액', r[1].title === '오늘 고정 지출이 나가요' && r[1].body === '보험 54,000원')
ok('번호는 2000부터', r[0].id === ID_RECURRING && r[1].id === ID_RECURRING + 1)
ok('수입 한 건 문구', planRecurring([{ item: I('월급', 1000), date: '2026-10-22' }], now)[0].title === '오늘 고정 수입이 들어와요')
ok('오늘이라도 9시 전이면 넣음', planRecurring([{ item: E('a', 1), date: '2026-10-21' }], new Date(2026, 9, 21, 8, 30)).length === 1)

const w = planWeekly({ remind_enabled: true, remind_weekday: 0, remind_time: '21:00:00' }, now)
ok('주간: 5번', w.length === 5)
ok('주간: 다음 일요일 21시부터', w[0].at.getDay() === 0 && w[0].at.getDate() === 25 && w[0].at.getHours() === 21, String(w[0].at))
ok('주간: 일주일 간격', (w[1].at - w[0].at) === 7 * 86400000 || Math.abs((w[1].at - w[0].at) - 7 * 86400000) <= 3600000)
ok('주간: 번호 1000부터, 누르면 캡처', w[0].id === ID_WEEKLY && w[0].extra.url === '/capture')
ok('주간: 오늘이 그 요일이고 시간이 안 지났으면 오늘', planWeekly({ remind_enabled: true, remind_weekday: 3, remind_time: '21:00:00' }, now)[0].at.getDate() === 21)
ok('주간: 오늘 그 요일인데 시간 지났으면 다음 주', planWeekly({ remind_enabled: true, remind_weekday: 3, remind_time: '09:00:00' }, now)[0].at.getDate() === 28)
ok('주간: 꺼져 있으면 없음', planWeekly({ remind_enabled: false }, now).length === 0 && planWeekly(null, now).length === 0)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
