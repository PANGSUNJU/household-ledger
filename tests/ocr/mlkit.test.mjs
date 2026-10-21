// ML Kit 결과(덩어리·줄·위치) → 한 줄 글자 → 지금 해석 규칙
import { mlkitToText } from '../../src/lib/ocr-mlkit-lines.js'
import { parseCapture } from '../../src/lib/ocr-parse.js'
let pass = 0, fail = 0
const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ← ' + i)) }
// 토스 화면처럼: 왼쪽 이름·시간, 오른쪽 금액·잔액이 따로따로 온다 (블록 순서도 뒤섞임)
const L = (text, left, top, w = 300, h = 40) => ({ text, boundingBox: { left, top, right: left + w, bottom: top + h }, lines: [{ text, boundingBox: { left, top, right: left + w, bottom: top + h } }] })
const result = { text: '', blocks: [
  L('-7,200원', 820, 420, 200), L('10월 12일', 50, 200, 160),
  L('한국맥도날드(유)경산정평DT점', 170, 418, 520), L('18:48', 170, 470, 80, 32), L('5,200원', 880, 472, 140, 32),
  L('체크카드 복권 당첨', 170, 300, 300), L('+13원', 900, 302, 120), L('18:48', 170, 352, 80, 32), L('5,213원', 880, 352, 140, 32),
  L('토스페이_마켓컬리_TOSS', 170, 540, 420), L('-40,000원', 800, 541, 220)
] }
const text = mlkitToText(result)
console.log(text)
const lines = text.split('\n')
ok('같은 줄 이름·금액이 한 줄로', lines.includes('한국맥도날드(유)경산정평DT점 -7,200원'), text)
ok('시간·잔액도 한 줄로', lines.includes('18:48 5,213원') && lines.includes('18:48 5,200원'), text)
ok('위→아래 순서', lines[0] === '10월 12일' && lines[1].startsWith('체크카드'), text)
const items = parseCapture(text, '2026-10-20')
ok('해석: 3건', items.length === 3, JSON.stringify(items))
ok('해석: 맥도날드 DT점 7,200 지출', items.some((x) => x.store === '한국맥도날드(유)경산정평DT점' && x.amount === 7200 && x.kind === 'expense' && x.date === '2026-10-12'), JSON.stringify(items))
ok('해석: 마켓컬리 TOSS 40,000', items.some((x) => /TOSS/.test(x.store) && x.amount === 40000), JSON.stringify(items))
ok('해석: 복권 +13 입금', items.some((x) => x.amount === 13 && x.kind === 'income'), JSON.stringify(items))
ok('빈 결과는 빈 글자', mlkitToText({ blocks: [] }) === '' && mlkitToText(null) === '')
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
