/*
 * 이미지 읽기 시험: 가짜 카드·은행 캡처와 영수증(tests/ocr/fixtures/*.png)을
 * 앱과 같은 도구(tesseract.js, 한국어+영어)로 읽고, 해석 결과를 확인한다.
 * 실제 캡처를 받으면 fixtures 에 넣고 기대값을 추가하면 된다.
 *   실행: npm run test:ocr
 */
import { createWorker } from 'tesseract.js'
import { parseCapture, parseReceipt, guessCategoryName, findAmounts } from '../../src/lib/ocr-parse.js'

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

// 6. 실제 앱 캡처 (이름·카드 번호는 가짜로 바꿈)
const t18 = '2026-10-18'
const noBlank = (xs) => xs.every((x) => x.store && !/^\d/.test(x.store))
for (const [f, label] of [['toss-light.png', '토스 라이트'], ['toss-dark.png', '토스 다크']]) {
  const t = parseCapture(await read(f), t18)
  const find = (re) => t.find((x) => re.test(x.store))
  ok(`${label}: 잔액 줄은 기록으로 안 만듦 (이름 빈 기록 없음)`, noBlank(t) && !t.some((x) => [996, 995, 994, 990].includes(x.amount)), show(t))
  ok(`${label}: 리워드 +4원 → 입금, '체크카드' 안 잘림`, find(/^체크카드 복권 당첨$/)?.amount === 4 && find(/^체크카드 복권 당첨$/)?.kind === 'income', show(t))
  ok(`${label}: 홍길동 -2,000 지출 (아이콘 글자 안 붙음)`, t.some((x) => x.store === '홍길동' && x.amount === 2000 && x.kind === 'expense'), show(t))
  ok(`${label}: 내 계좌 옮긴 돈도 둘 다 들어옴 (체크는 사용자가)`, t.some((x) => x.store === '이영희' && x.amount === 78200 && x.kind === 'income') && t.some((x) => x.store === '자금' && x.amount === 78200 && x.kind === 'expense'), show(t))
  ok(`${label}: 10/14 날짜`, t.find((x) => x.store === '홍길동')?.date === '2026-10-14', show(t))
}
const td = parseCapture(await read('toss-dark.png'), t18)
ok('토스 다크: 위가 잘린 맨 위 건은 날짜 비우고 표시', td[0]?.noDate === true && td[0]?.date === '' && /받은 돈/.test(td[0]?.store), show(td))
const tl = parseCapture(await read('toss-light.png'), t18)
ok('토스 라이트: 맨 위 건은 10/18', tl[0]?.date === '2026-10-18' && !tl[0]?.noDate, show(tl))

const h = parseCapture(await read('hana-list.png'), t18)
ok('하나카드: 5건 날짜·금액', h.length === 5 && h.map((x) => x.date + ':' + x.amount).join() === '2026-10-16:10450,2026-10-15:39000,2026-10-14:12000,2026-10-13:148819,2026-10-12:89890', show(h))
ok('하나카드: 말줄임(…)을 취소로 보지 않음', h[3]?.kind === 'expense' && h[3]?.store.startsWith('ANTHROPIC'), show(h))
ok('하나카드: 아이콘 글자 안 붙음', h[2]?.store === '홈마트 정육코너' && h[0]?.store === '쿠팡(쿠페이)', show(h))
ok('하나카드: 카드 번호·일시불이 이름에 없음', h.every((x) => !/1234|일시불|본인/.test(x.store)), show(h))

// 날짜가 기록 아래에 붙는 카드 앱 (신한 매출전표 모양, 가짜 이름)
const db = parseCapture(await read('date-below-list.png'), '2026-10-20')
const dbOk = (store, date, amount, kind = 'expense') => db.some((x) => x.store.startsWith(store) && x.date === date && x.amount === amount && x.kind === kind)
ok('아래 날짜: 6건', db.length === 6, show(db))
ok('아래 날짜: 맨 위 쿠팡은 바로 아래 10/19', dbOk('쿠팡', '2026-10-19', 33750) && !db[0]?.noDate, show(db))
ok('아래 날짜: 씨유 10/17, 쿠팡이츠 10/17', dbOk('씨유', '2026-10-17', 3600) && dbOk('쿠팡이츠', '2026-10-17', 16900), show(db))
ok('아래 날짜: 한 칸씩 밀리지 않음 (메가커피 10/15, 국밥 10/11)', dbOk('메가커피', '2026-10-15', 14900) && dbOk('가마', '2026-10-11', 23000), show(db))
ok('아래 날짜: 날짜 줄 밑의 승인취소도 알아봄', db.some((x) => x.store.startsWith('가나다상회') && x.date === '2026-10-13' && x.kind === 'cancel'), show(db))
ok('아래 날짜: 취소 아닌 건은 지출', db.filter((x) => x.kind === 'expense').length === 5, show(db))

// 잔액 자동충전 줄 (토스 카드 화면 글자 그대로, 가짜 가게): 숨기지 않고 charge 로 표시
const ch = parseCapture(`10월 12일
체크카드 복권 당첨 +13원
18:48 5,213원
가나다버거 경산점 -7,200원
18:48 5,200원
w 카드잔액자동충전 +10,000원
18:48 12,400원
9월교통카드이용 -8,100원
16:17 2,400원
| 카드잔액자동충전 +30,496원
12:05 40,000원
현대오일 전기차충전소 -12,000원
12:00 10,000원`, '2026-10-20')
ok('충전: 6건 모두 보임 (잔액 줄은 여전히 뺌)', ch.length === 6, show(ch))
ok('충전: 자동충전 2건은 charge 표시', ch.filter((x) => x.charge).map((x) => x.amount).join() === '10000,30496', show(ch))
ok('충전: 이름은 카드잔액자동충전', ch.filter((x) => x.charge).every((x) => /카드잔액\s?자동충전/.test(x.store)), show(ch))
ok('충전: 충전소는 보통 지출', ch.some((x) => /충전소/.test(x.store) && x.kind === 'expense' && !x.charge), show(ch))
ok('충전: 다른 건은 charge 아님', ch.filter((x) => !x.charge).length === 4, show(ch))

// 금액 맨 앞 7 이 / 로 읽힌 경우, 이름 끝 찌꺼기 '_' (실제 토스 캡처에서 나온 모양, 가짜 가게)
const sl = parseCapture(`10월 12일
가나다버거(유)경산점 _ -/200원
18:48 5,200원
9월교통카드이용 -8,100원
16:17 2,400원`, '2026-10-20')
ok("'/200원' → 7,200원", sl[0]?.amount === 7200 && sl[0]?.kind === 'expense', show(sl))
ok("이름 끝 '_' 지움", sl[0]?.store === '가나다버거(유)경산점', show(sl))
ok('날짜 10/12 는 그대로 날짜', sl.every((x) => x.date === '2026-10-12'), show(sl))

// 잔액으로 금액 맞춰 보기 (토스 모양 글자, 가짜 가게)
const TOSS_TXT = (mac) => `10월 12일
체크카드 복권 당첨 +13원
18:48 5,213원
가나다버거 경산점 -${mac}원
18:48 5,200원
카드잔액자동충전 +10,000원
18:48 12,400원
9월교통카드이용 -8,100원
16:17 2,400원
카드잔액자동충전 +10,000원
16:17 10,500원
카드 캐시백 +500원
12:05 500원`
const bf = parseCapture(TOSS_TXT('1,200'), '2026-10-20')
ok('잔액: 7,200 을 1,200 으로 잘못 읽어도 7,200 으로 고침', bf.find((x) => x.store.startsWith('가나다버거'))?.amount === 7200 && bf.find((x) => x.store.startsWith('가나다버거'))?.fixed === 'balance', show(bf))
ok('잔액: 맞게 읽은 건 그대로 (fixed 없음)', bf.filter((x) => x.fixed).length === 1, show(bf))
const bfOk = parseCapture(TOSS_TXT('7,200'), '2026-10-20')
ok('잔액: 다 맞으면 아무것도 안 고침', bfOk.every((x) => !x.fixed) && bfOk.map((x) => x.amount).join() === '13,7200,10000,8100,10000,500', show(bfOk))
const bfBal = parseCapture(TOSS_TXT('7,200').replace('16:17 2,400원', '16:17 2,900원'), '2026-10-20')
ok('잔액: 잔액 하나를 잘못 읽으면 금액은 건드리지 않음', bfBal.map((x) => x.amount).join() === '13,7200,10000,8100,10000,500', show(bfBal))
ok('잔액: 결과에 잔액 값은 안 남김', bf.every((x) => x.balance === undefined), show(bf))

// '원' 이 숫자로 읽힌 경우
const wn = (l) => findAmounts(l).map((a) => a.sign + a.value).join()
ok("'+5009' → +500", wn('카드 캐시백 +5009') === '+500')
ok("'44,0008' → 44,000", wn('가나다상회 44,0008') === '44000')
ok("'-1000' 처럼 0 으로 끝나면 건드리지 않음", wn('가나다 -1000') === '')
ok("시간·잔액 줄 '12:05 5009' 는 부호 없어서 그대로 안 읽음", wn('12:05 5009') === '')
ok("멀쩡한 '7,200원' 은 그대로", wn('가나다 -7,200원') === '-7200')

// 5. 분류 짐작
ok('분류 짐작: 메가커피 → 카페·간식', guessCategoryName('메가커피 경산중앙점') === '카페·간식')
ok('분류 짐작: 다이소 → 생활용품', guessCategoryName('(주)아성다이소 경산점') === '생활용품')
ok('분류 짐작: 모르는 가게 → 없음', guessCategoryName('홍길동상회') === null)

await w.terminate()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
