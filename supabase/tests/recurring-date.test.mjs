/*
 * 고정 항목 날짜 규칙이 앱(src/lib/recurring.js)과 DB(recurring_date)에서 똑같은지 확인
 * 2년 × 1~31일 × 앞 평일/뒤 평일/그날 그대로 = 2,232가지를 모두 비교한다.
 */
import { PGlite } from '@electric-sql/pglite'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 앱 코드를 node 에서 불러오기 위해 묶는다 (화면·DB 연결 부분은 빈 껍데기로)
const out = join(tmpdir(), `recurring-${process.pid}.mjs`)
await build({
  entryPoints: ['src/lib/recurring.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  plugins: [{
    name: 'stub',
    setup(b) {
      b.onResolve({ filter: /^(vue|\.\/api)$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const reactive = (x) => x; export const generateRecurring = async () => 0; export const isMissingSetup = () => false' }))
    }
  }]
})
const { occurrenceDate } = await import(pathToFileURL(out).href)

const db = new PGlite()
const sql = readFileSync('supabase/migrations/0005_weekend_same.sql', 'utf8')   // 가장 최근 recurring_date
const fn = sql.slice(sql.indexOf('create or replace function public.recurring_date'), sql.indexOf('end $$;', sql.indexOf('create or replace function public.recurring_date')) + 7)
await db.exec(fn)

let pass = 0, fail = 0
for (let i = 0; i < 24; i++) {
  const y = 2026 + Math.floor(i / 12), m = (i % 12) + 1
  for (let day = 1; day <= 31; day++) {
    for (const rule of ['before', 'after', 'same']) {
      const js = occurrenceDate({ day_of_month: day, weekend_rule: rule }, y, m)
      const r = await db.query(`select recurring_date(make_date($1, $2, 1), $3, $4)::text d`, [y, m, day, rule])
      if (js === r.rows[0].d) pass++
      else { fail++; console.log(`FAIL ${y}-${m} ${day}일 ${rule}: 앱 ${js} / DB ${r.rows[0].d}`) }
    }
  }
}
console.log(`날짜 규칙 앱=DB: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
