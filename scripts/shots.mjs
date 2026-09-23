// Screenshot helper: node scripts/shots.mjs <url-path> <out.png> [--wait ms] [--keys 2] [--click testid] [--w 1280 --h 800]
import { chromium } from '@playwright/test'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
const path = args[0] ?? '/'
const out = args[1] ?? 'shot.png'
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const page = await browser.newPage({ viewport: { width: Number(opt('w', 1440)), height: Number(opt('h', 900)) } })
const errors = [], external = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (['localhost', '127.0.0.1'].includes(u.hostname)) return r.continue(); external.push(u.href); return r.abort() })
const base = opt('base', 'http://localhost:5173')
await page.goto(base + path)
await page.waitForTimeout(1500)
for (const c of (opt('click', '') || '').split(',').filter(Boolean)) { await page.getByTestId(c).click().catch((e) => errors.push('click ' + c + ': ' + e.message)); await page.waitForTimeout(300) }
for (const k of (opt('keys', '') || '').split(',').filter(Boolean)) { await page.keyboard.press(k); await page.waitForTimeout(200) }
await page.waitForTimeout(Number(opt('wait', 1000)))
await page.screenshot({ path: out })
console.log(JSON.stringify({ errors: errors.slice(0, 8), external }))
await browser.close()
