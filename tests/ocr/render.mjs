// 시험용 가짜 캡처·영수증 HTML → PNG (폰 화면처럼 3배 크기)
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
const dir = resolve(process.argv[2] || 'tests/ocr/fixtures')
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch())
const p = await b.newPage({ viewport: { width: 390, height: 400 }, deviceScaleFactor: 3 })
for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  await p.goto('file://' + join(dir, f)); await p.waitForTimeout(200)
  await p.screenshot({ path: join(dir, f.replace('.html', '.png')), fullPage: true })
}
await b.close()
console.log('rendered')
