/*
 * 이미지 읽기 시험: 가짜 카드·은행 캡처와 영수증(tests/ocr/fixtures/*.png)을
 * 앱과 같은 도구(tesseract.js, 한국어+영어)로 읽고, 해석 결과를 확인한다.
 * 실제 캡처를 받으면 fixtures 에 넣고 기대값을 추가하면 된다.
 *   실행: npm run test:ocr
 */
import { createWorker } from 'tesseract.js'
import { parseCapture, parseReceipt, guessCategoryName } from '../../src/lib/ocr-parse.js'

const today = '2026-10-16'
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + info)) }

const w = await createWorker(['kor', 'eng'], 1, { langPath: 'public/ocr/lang', gzip: true, cacheMethod: 'none' })
const read = async (f) => (await w.recognize(`tests/ocr/fixtures/${f}`)).data.text

// 1. 카드 앱 이용내역
const card = parseCapture(await read('card-list.png'), today)
const show = (xs) => JSON.stringify(xs.map((x) => [x.date, x.store, x.amount, x.kind]))
ok('카드: 4건 (총 이용금액 줄은 뺌)', card.length === 4, show(card))
ok('카드: 메가커피 10/16 4,500 지출', card[0]?.date === '2026-10-16' && card[0]?.store.startsWith('메가커피') && card[0]?.amount === 4500 && card[0]?.kind === 'expense', show(card))
ok('카드: 다이소 10/15 12,300', card[1]?.date === '2026-10-15' && card[1]?.store.includes('다이소') && card[1]?.amount === 12300, show(card))
ok('카드: 쿠팡은 승인취소 → 취소 건', card[2]?.store === '쿠팡' && card[2]?.kind === 'cancel', show(card))
ok('카드: 마지막 건 10/14 5,500', card[3]?.date === '2026-10-14' && card[3]?.amount === 5500, show(card))
ok('카드: 가게 이름에 승인·일시불·시간 안 붙음', card.every((x) => !/승인|일시불|\d{1,2}:\d{2}/.test(x.store)), show(card))

// 2. 은행 앱 (+/-)
const bank = parseCapture(await read('bank-list.png'), today)
ok('은행: 3건 (잔액 줄은 뺌)', bank.length === 3, show(bank))
ok('은행: 메가커피 -4,500 → 지출', bank[0]?.store === '메가커피' && bank[0]?.amount === 4500 && bank[0]?.kind === 'expense', show(bank))
ok('은행: +3,200,000 → 입금', bank[1]?.amount === 3200000 && bank[1]?.kind === 'income' && bank[1]?.date === '2026-10-15', show(bank))
ok('은행: 관리비 자동이체 152,000 지출', bank[2]?.store.includes('관리비') && bank[2]?.amount === 152000 && bank[2]?.kind === 'expense', show(bank))

// 3. 영수증
const r = parseReceipt(await read('receipt.png'), today)
ok('영수증: 가게 이마트 경산점', r.store === '이마트 경산점', JSON.stringify(r))
ok('영수증: 날짜 2026-10-15', r.date === '2026-10-15', JSON.stringify(r))
ok('영수증: 합계 14,380', r.amount === 14380, JSON.stringify(r))
ok('영수증: 품목 3개 → 메모', r.items.length === 3 && r.memo.includes('식빵') && r.memo.includes('계란'), JSON.stringify(r))
ok('영수증: 취소 아님', r.canceled === false)
ok('영수증: 카드번호가 메모·가게에 없음', !/\d{4}/.test(r.store) && !/1234|1934/.test(r.memo), JSON.stringify(r))

// 4. 취소 영수증
const c = parseReceipt(await read('cancel-receipt.png'), today)
ok('취소 영수증: 취소로 알아봄', c.canceled === true, JSON.stringify(c))
ok('취소 영수증: 금액 14,380 (부호 없이)', c.amount === 14380, JSON.stringify(c))
ok('취소 영수증: 가게·날짜', c.store === '이마트 경산점' && c.date === '2026-10-17', JSON.stringify(c))

// 5. 분류 짐작
ok('분류 짐작: 메가커피 → 카페·간식', guessCategoryName('메가커피 경산중앙점') === '카페·간식')
ok('분류 짐작: 다이소 → 생활용품', guessCategoryName('(주)아성다이소 경산점') === '생활용품')
ok('분류 짐작: 모르는 가게 → 없음', guessCategoryName('홍길동상회') === null)

await w.terminate()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
