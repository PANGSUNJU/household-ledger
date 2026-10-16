/*
 * 알림 보내기 함수(supabase/functions/send-reminders)의 '언제 보낼지' 규칙 시험
 * (보내기 자체는 Supabase 서버에서만 돈다. 여기서는 판단 규칙만 node 에서 확인)
 *   실행: npm run test:push
 */
import { build } from 'esbuild'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = join(tmpdir(), `send-reminders-${process.pid}.mjs`)
await build({ entryPoints: ['supabase/functions/send-reminders/index.ts'], outfile: out, format: 'esm', platform: 'node', logLevel: 'error' })
const { kstNow, isDue, buildMessage } = await import(pathToFileURL(out).href)

let pass = 0, fail = 0
const ok = (n, c, info = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ← ' + info)) }

// 한국 시간: 2026-10-18(일) 21:05 = UTC 12:05
const sun2105 = kstNow(new Date('2026-10-18T12:05:00Z'))
ok('한국 날짜·요일·시각', sun2105.date === '2026-10-18' && sun2105.weekday === 0 && sun2105.time === '21:05', JSON.stringify(sun2105))
const midnight = kstNow(new Date('2026-10-17T15:30:00Z'))
ok('UTC 15:30 → 한국 다음날 00:30', midnight.date === '2026-10-18' && midnight.time === '00:30', JSON.stringify(midnight))

const s = { user_id: 'u', remind_enabled: true, remind_weekday: 0, remind_time: '21:00:00', remind_sent_on: null }
ok('일요일 21:00 설정, 21:05 → 보냄', isDue(s, sun2105))
ok('20:55 → 아직', !isDue(s, kstNow(new Date('2026-10-18T11:55:00Z'))))
ok('오늘 이미 보냄 → 안 보냄', !isDue({ ...s, remind_sent_on: '2026-10-18' }, sun2105))
ok('지난주에 보냄 → 이번 주 보냄', isDue({ ...s, remind_sent_on: '2026-10-11' }, sun2105))
ok('월요일 → 안 보냄', !isDue(s, kstNow(new Date('2026-10-19T12:05:00Z'))))
ok('알림 꺼짐 → 안 보냄', !isDue({ ...s, remind_enabled: false }, sun2105))
ok('21:30 설정은 21:05엔 아직', !isDue({ ...s, remind_time: '21:30:00' }, sun2105))

const m1 = buildMessage(2)
ok('금액 입력 필요 2건 문구 + 고정 항목 화면으로', m1.body.includes('2건') && m1.url === '/settings/recurring')
const m0 = buildMessage(0)
ok('없으면 캡처로 정리 안내 + 캡처 화면으로', m0.body.includes('캡처') && m0.url === '/capture')
ok('시험 알림 제목', buildMessage(0, true).title.includes('시험'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
