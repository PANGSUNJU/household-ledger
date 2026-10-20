// 금액·날짜 다시 읽기 도우미 시험 (화면 없이)
import { amountBox, cleanReread, replaceAmount, pickAmount, dateBox, cleanDate, replaceDate } from '../../src/lib/ocr-amount.js'
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + info)) }
const W = (text, x0, x1) => ({ text, bbox: { x0, x1, y0: 10, y1: 54 } })
const L = (...words) => ({ words, bbox: { x0: 0, x1: 1080, y0: 10, y1: 54 } })

// amountBox
let r = amountBox(L(W('내고장', 60, 300), W('1,780', 873, 1019), W('원', 977, 1023)))
ok("'1,780' + '원' 을 한 덩어리로", r && r.parts.join('') === '1,780원' && r.box.x0 === 873, JSON.stringify(r))
r = amountBox(L(W('대성에너지(주)', 60, 300), W('9', 840, 860), W('660원', 872, 1020)))
ok("'9' + '660원' (가까움) 붙임", r && r.parts.join('') === '9660원', JSON.stringify(r))
r = amountBox(L(W('카카오', 62, 177), W('택시', 206, 270), W('8', 295, 317), W('13,300', 848, 1020), W('원', 977, 1022)))
ok("이름 끝 '_8' 은 멀어서 안 붙임", r && r.parts.join('') === '13,300원', JSON.stringify(r))
r = amountBox(L(W('가나다버거', 60, 500), W('-/200원', 560, 700)))
ok("'-/200원' 잡음", r && r.parts.join('') === '-/200원', JSON.stringify(r))
ok('시간 줄은 금액 아님', amountBox(L(W('18:48', 60, 140))) === null)
ok('날짜 줄(맨 오른쪽이 일시불)은 금액 아님', amountBox(L(W('2026.10.19', 60, 250), W('18:43', 264, 352), W('일시불', 634, 731))) === null)
ok('숫자 섞인 이름(9월교통카드이용)만 있는 줄은 금액 아님', amountBox(L(W('9월교통카드이용', 60, 400))) === null)

// cleanReread / pickAmount / replaceAmount
ok("cleanReread '7,200원'", cleanReread('7,200원') === '7,200원')
ok("cleanReread 부호 떼기 '-7,200원'", cleanReread('-7,200원') === '7,200원')
ok("cleanReread 점→쉼표 '9.660원'", cleanReread('9.660원') === '9,660원')
ok("cleanReread 이상한 모양은 null", cleanReread('72,00원') === null && cleanReread('5009') === null && cleanReread('') === null)
ok('pickAmount: 원래가 멀쩡하면 그대로', pickAmount(['-40,000', '원'], '740,000원') === null)
ok('pickAmount: 원래가 깨졌으면 다시 읽은 것', pickAmount(['-/200원'], '7,200원') === '7,200원' && pickAmount(['?,000원'], '9,000원') === '9,000원')
ok('pickAmount: 다시 읽기도 실패면 그대로', pickAmount(['?,000원'], null) === null)
ok('replaceAmount: 부호는 원래 것', replaceAmount('가나다버거 _ -/200원', ['-/200원'], '7,200원') === '가나다버거 _ -7,200원')
ok('replaceAmount: 나뉜 조각 바꾸기', replaceAmount('대성에너지(주) 9 660원', ['9', '660원'], '9,660원') === '대성에너지(주) 9,660원')

// 날짜
r = dateBox(L(W('2026.09.2?', 60, 249), W('11:45', 264, 352), W('본인', 413, 475)))
ok("깨진 날짜 '2026.09.2?' + 시간 잡음", r && r.parts.join(' ') === '2026.09.2? 11:45', JSON.stringify(r))
ok('멀쩡한 날짜는 다시 안 읽음', dateBox(L(W('2026.09.29', 60, 249), W('11:45', 264, 352))) === null)
ok('날짜로 시작 안 하면 null', dateBox(L(W('쿠팡', 60, 120))) === null)
ok("cleanDate '2026.09.2911:45'", cleanDate('2026.09.2911:45') === '2026.09.29 11:45')
ok("cleanDate '2026.09.29'", cleanDate('2026.09.29') === '2026.09.29')
ok('cleanDate 13월은 null', cleanDate('2026.13.01') === null)
ok("cleanDate 점 빠진 '2026.0925' → 2026.09.25", cleanDate('2026.0925') === '2026.09.25')
ok('replaceDate', replaceDate('2026.09.2? 11:45 · 본인 752*', ['2026.09.2?', '11:45'], '2026.09.29 11:45') === '2026.09.29 11:45 · 본인 752*')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
