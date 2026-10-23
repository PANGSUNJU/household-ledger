// 실제 ML Kit 결과로 시험 (안드로이드 에뮬레이터에서 가짜 캡처 조각을 ML Kit 한국어로 읽은 결과 그대로)
//  · 만든 곳: mlkit-lab 브랜치 (MlkitProbeTest) — 조각은 앱과 같은 방법(폭의 1배 높이)으로 자름
//  · ML Kit 는 금액 끝 '원'을 빼거나(8,000) '%l', 'A', '!', 숫자(3,6002)로 읽는다 → fixWon 으로 바로잡는지
import { readFileSync, readdirSync } from 'node:fs'
import { mlkitToText, fixWon } from '../../src/lib/ocr-mlkit-lines.js'
import { parseCapture } from '../../src/lib/ocr-parse.js'
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + info)) }
const D = new URL('./fixtures/mlkit/', import.meta.url)
const files = readdirSync(D).filter((f) => /-p\d+\.json$/.test(f))
const read = (name) => files.filter((f) => f.startsWith(name + '-p')).sort((a, b) => Number(a.match(/-p(\d+)/)[1]) - Number(b.match(/-p(\d+)/)[1]))
  .map((f) => mlkitToText(JSON.parse(readFileSync(new URL(f, D), 'utf8')))).join('\n')
const T = '2026-10-23'

// fixWon 낱개
for (const [a, b] of [['8,000', '8,000원'], ['33,750%l', '33,750원'], ['5,500%1', '5,500원'], ['1,234,560!', '1,234,560원'], ['3,6002', '3,600원'], ['14,900 A', '14,900원'], ['14,900A', '14,900원'], ['-2,000', '-2,000원'], ['+2,990%l', '+2,990원'], ['400원', '400원'], ['14:22 메가커피 -4,500', '14:22 메가커피 -4,500원']]) ok(`fixWon '${a}'`, fixWon(a) === b, fixWon(a))
for (const a of ['18:43', '2026.10.19 18:43 본인 123*. 일시불', '본인1234', '10월 16일', '400']) ok(`fixWon 그대로 '${a}'`, fixWon(a) === a, fixWon(a))
ok("오른쪽 칸 '400' → 400원", fixWon('400', true) === '400원')

// 하나카드 모양 40건 (8조각)
const key = JSON.parse(readFileSync(new URL('hana-key.json', D), 'utf8'))
const hana = parseCapture(read('hana'), T)
ok('하나카드 모양: 40건 모두', hana.length === key.length, `${hana.length}/${key.length}`)
ok('하나카드 모양: 금액·날짜 모두 맞음', key.every((k, i) => hana[i]?.amount === k.amount && hana[i]?.date === k.date), JSON.stringify(key.map((k, i) => [k.amount, hana[i]?.amount]).filter(([a, b]) => a !== b)))
ok("하나카드 모양: '결제취소 >' 줄은 취소로 (화면에서 지출·수입으로 바꿀 수 있음)", key.every((k, i) => (hana[i]?.kind === 'cancel') === k.cancelBtn))
// 신한 매출전표 모양 6건 (아래 날짜)
const sh = parseCapture(read('shinhanlike'), T)
ok('신한 모양: 6건, 금액', sh.map((x) => x.amount).join() === '33750,3600,16900,14900,44000,23000', JSON.stringify(sh.map((x) => x.amount)))
ok('신한 모양: 승인취소 1건', sh.filter((x) => x.kind === 'cancel').length === 1)
// 카드 앱 모양 4건
const cd = parseCapture(read('card'), T)
ok('카드 모양: 4건 (취소 1)', cd.length === 4 && cd.filter((x) => x.kind === 'cancel').length === 1 && cd.map((x) => x.amount).join() === '4500,12300,10000,5500', JSON.stringify(cd.map((x) => [x.amount, x.kind])))
// 은행 앱 모양 3건 (잔액 줄은 빼고)
const bk = parseCapture(read('bank'), T)
ok('은행 모양: 3건 (입금 1)', bk.length === 3 && bk.map((x) => `${x.kind}:${x.amount}`).join() === 'expense:4500,income:3200000,expense:152000', JSON.stringify(bk.map((x) => [x.kind, x.amount])))
// 토스 모양 9건
const ts = parseCapture(read('toss'), T)
ok('토스 모양: 9건, 금액', ts.length === 9 && ts.map((x) => x.amount).join() === '1,1,4,2000,1,2990,1,78200,78200', JSON.stringify(ts.map((x) => x.amount)))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
