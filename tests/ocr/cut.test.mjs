// 긴 캡처 자르기 시험: 기록 줄(글자) 사이 빈 줄에서만 자르는지
import { pickCuts } from '../../src/lib/ocr-cut.js'
let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + info)) }

// 가짜 긴 캡처: 폭 120, 높이 ah. 30줄 글자 + 18줄 빈칸을 되풀이 (글자 줄은 검정·흰 무늬)
function fake(ah, dark = false) {
  const aw = 120, d = new Uint8ClampedArray(aw * ah * 4)
  const text = (y) => y % 48 < 30
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
    const i = (y * aw + x) * 4
    let g = dark ? 20 : 255
    if (text(y) && x > 10 && x < 100 && (x + y) % 7 < 3) g = dark ? 230 : 30
    d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255
  }
  return { d, aw, text }
}
for (const dark of [false, true]) {
  const ah = 2000, ratio = 9, sh = ah * ratio, piece = 1080 * 2.5
  const { d, aw, text } = fake(ah, dark)
  const cuts = pickCuts(d, aw, ah, ratio, sh, piece)
  const label = dark ? '어두운 화면' : '밝은 화면'
  ok(`${label}: 처음 0, 끝 전체 높이`, cuts[0] === 0 && cuts.at(-1) === sh, cuts.join())
  ok(`${label}: 여러 조각으로 나눔`, cuts.length >= 6, cuts.join())
  const inner = cuts.slice(1, -1)
  ok(`${label}: 자른 자리는 모두 빈 줄 (글자 가운데 안 자름)`, inner.every((c) => !text(Math.round(c / ratio))), inner.map((c) => Math.round(c / ratio)).join())
  const sizes = cuts.slice(1).map((c, k) => c - cuts[k])
  ok(`${label}: 조각 높이가 너무 크거나 작지 않음`, sizes.every((h) => h > piece * 0.6 && h < piece * 1.9), sizes.join())
}
// 보통 캡처(폰 한 화면)는 자르지 않음
const short = fake(260)
ok('보통 캡처(1080×2340)는 한 조각', pickCuts(short.d, 120, 260, 9, 2340, 2700).length === 2)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
