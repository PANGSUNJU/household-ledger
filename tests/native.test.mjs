// 앱 로그인에서 돌아온 주소 읽기
import { parseAuthReturn, NATIVE_REDIRECT } from '../src/lib/native.js'
let pass = 0, fail = 0
const ok = (n, c, i = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ← ' + i)) }
const j = (x) => JSON.stringify(x)
ok('주소 확인', NATIVE_REDIRECT === 'dev.pang7163y.ledger://login')
ok('토큰 (#)', j(parseAuthReturn(NATIVE_REDIRECT + '#access_token=a1&refresh_token=r1&expires_in=3600&token_type=bearer')) === j({ access_token: 'a1', refresh_token: 'r1' }))
ok('코드 (?code=)', j(parseAuthReturn(NATIVE_REDIRECT + '?code=c9')) === j({ code: 'c9' }))
ok('취소 오류', parseAuthReturn(NATIVE_REDIRECT + '#error=access_denied&error_description=User+cancelled')?.error === 'User cancelled')
ok('다른 주소는 무시', parseAuthReturn('https://example.com/#access_token=x&refresh_token=y') === null)
ok('빈 값 무시', parseAuthReturn(NATIVE_REDIRECT) === null && parseAuthReturn('') === null)
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
