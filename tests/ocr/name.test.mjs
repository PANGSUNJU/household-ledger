// [시험 기능] 이름 다시 읽기: 어느 줄을 고르는지 (화면 없이)
import { planNames, putName } from '../../src/lib/ocr-name-plan.js'
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + info)) }
const W = (text, x0, x1, confidence = 95) => ({ text, confidence, bbox: { x0, x1, y0: 10, y1: 54 } })
const L = (...words) => ({ words, bbox: { x0: 0, x1: 1080, y0: 10, y1: 54 } })
const amt = (x0) => ({ box: { x0, x1: 1020, y0: 10, y1: 54 }, parts: ['-7,200원'] })

const lines = [
  L(W('w', 60, 90), W('카드잔액자동충전', 170, 560), W('+10,000원', 840, 1020)),         // 0: 깨끗한 이름 → 안 고름
  L(W('한국맥도날드(유)경산정평0ㅠ점', 170, 700), W('-7,200원', 840, 1020)),              // 1: 기호·자모 → 고름
  L(W('18:48', 170, 260), W('5,200원', 880, 1020)),                                      // 2: 시간·잔액 줄 → 안 고름
  L(W('토스페이', 170, 300), W('마켓컬리', 320, 450), W('1055', 470, 540), W('-40,000원', 840, 1020)), // 3: 숫자 4자리 → 고름
  L(W('9월교통카드이용', 170, 480), W('-8,100원', 840, 1020)),                           // 4: '9월' 은 괜찮음 → 안 고름
  L(W('메가커피', 170, 330, 60), W('-4,500원', 840, 1020))                               // 5: 읽기 도구가 자신 없음 → 고름
]
const cand = lines.map((l, i) => ({ i, ...amt(840) }))
const plan = planNames(lines, cand)
ok('미심쩍은 이름만 고름 (1, 3, 5)', plan.map((p) => p.i).join() === '1,3,5', plan.map((p) => p.i).join())
ok('이름 시작은 목록 이름들의 왼쪽 줄(170) 근처 (아이콘 w 는 피함)', plan.every((p) => p.box.x0 >= 150 && p.box.x0 <= 170), plan.map((p) => p.box.x0).join())
ok('이름 끝은 금액 바로 앞', plan.every((p) => p.box.x1 === 836))
ok('putName: 이름 바꾸고 금액은 그대로', putName('한국맥도날드(유)경산정평0ㅠ점 _ -7,200원', ['-7,200원'], '한국맥도날드(유)경산정평DT점') === '한국맥도날드(유)경산정평DT점 -7,200원')
ok("putName: 아이콘이 붙은 한 글자 떼기 'w카드잔액'", putName('w 카드잔액자동충전 +10,000원', ['+10,000원'], 'w카드잔액 자동충전') === '카드잔액 자동충전 +10,000원')
ok("putName: 영어로 시작하는 이름은 그대로 'LG U+'", putName('LG U+ -19,940원', ['-19,940원'], 'LG U+통신요금') === 'LG U+통신요금 -19,940원')
ok('putName: 금액 글자를 못 찾으면 그대로', putName('가나다 -7,200원', ['-9,999원'], '바뀜') === '가나다 -7,200원')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
