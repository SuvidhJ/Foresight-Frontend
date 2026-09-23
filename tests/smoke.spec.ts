import { expect, test, type Page } from '@playwright/test'

/** Fails the test if the page tries to reach anything outside this machine (offline rule). */
async function offline(page: Page) {
  const external: string[] = []
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    if (host === 'localhost' || host === '127.0.0.1') return route.continue()
    external.push(route.request().url())
    return route.abort()
  })
  return external
}

async function startScenario(page: Page, id: string) {
  await page.getByTestId('start-shift').click()
  await page.keyboard.press(id)
}

test('every screen renders offline without errors', async ({ page }) => {
  const external = await offline(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const [path, heading] of [
    ['/preshift', 'Pre-shift'],
    ['/overview', 'Shift overview'],
    ['/flags', 'Unusual behaviour'],
    ['/incidents', 'Incident log'],
    ['/training', 'Training hub'],
    ['/summary', 'Shift summary'],
    ['/evidence', 'Evidence'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 15_000 })
  }
  await page.goto('/cab')
  await expect(page.getByTestId('site-view').locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('scenario 2: soft warning, then hard stop, logged with its warning time', async ({ page }) => {
  await offline(page)
  await page.goto('/stage')
  await startScenario(page, '2')
  const strip = page.getByTestId('alert-strip')
  await expect(strip).toHaveAttribute('data-tier', 'soft', { timeout: 10_000 })
  await expect(strip).toContainText('Person closing')
  // Direction relative to the cab, not a compass point: the worker comes in on the operator's left.
  await expect(page.getByTestId('hazard-dial')).toHaveAttribute('data-side', /left|ahead/)
  await expect(strip).toHaveAttribute('data-tier', 'hard', { timeout: 10_000 })
  await expect(page.getByTestId('stop-flash')).toBeVisible()
  await expect(strip).toContainText('MOTION INHIBITED')
  await expect(strip).toContainText('warned 4.8 s before breach')
  // A hard alert has no dismiss path, by button or key.
  await page.keyboard.press('d')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('stage-feed')).toContainText('warned 4.8 s before breach')
  await expect(strip).toHaveAttribute('data-tier', 'none', { timeout: 10_000 })
  // The loop is closed: the operator is told motion is back and that the near-miss was logged.
  await expect(strip).toHaveAttribute('data-state', 'restored')
  await expect(strip).toContainText('motion restored')
})

test('scenario 3: fog and rain widen the zones and the cab says why', async ({ page }) => {
  await offline(page)
  await page.goto('/cab')
  await startScenario(page, '3')
  const notice = page.getByTestId('conditions-notice')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await expect(notice).toContainText('+75%', { timeout: 10_000 })
  await expect(page.getByTestId('zone-growth')).toContainText('Zones +30%', { timeout: 10_000 })
  await expect(page.getByTestId('label-V9')).toContainText('hard to see', { timeout: 10_000 })
  await expect(page.getByTestId('alert-strip')).toHaveAttribute('data-tier', 'soft', { timeout: 10_000 })
})

test('the demo stage starts a scenario from its start screen and narrates it', async ({ page }) => {
  await offline(page)
  await page.goto('/stage')
  await page.getByTestId('gate-scenario-2').click()
  await expect(page.getByTestId('scenario-timeline')).toContainText('Early warning')
  await expect(page.getByTestId('scenario-timeline')).toContainText('model sees the paths converging', { timeout: 10_000 })
})

test('replay shows how early the operator was warned', async ({ page }) => {
  await offline(page)
  await page.goto('/cab')
  await startScenario(page, '2')
  await expect(page.getByTestId('alert-strip')).toHaveAttribute('data-tier', 'hard', { timeout: 15_000 })
  await expect(page.getByTestId('alert-strip')).toHaveAttribute('data-tier', 'none', { timeout: 10_000 })
  await page.keyboard.press('r')
  await expect(page.getByTestId('replay')).toContainText('warned 4.8 s before the inner zone was breached')
})

test('tampering with a stored record breaks the chain at that record', async ({ page }) => {
  await offline(page)
  await page.goto('/incidents')
  const badge = page.getByTestId('integrity')
  await expect(badge).toHaveAttribute('data-ok', 'true', { timeout: 15_000 })
  await page.getByTestId('tamper').click()
  await expect(badge).toHaveAttribute('data-ok', 'false')
  await expect(badge).toContainText('Chain broken at record #')
  await page.getByRole('button', { name: 'Restore row' }).click()
  await expect(badge).toHaveAttribute('data-ok', 'true')
})

test("the brief's rows 2 and 4 are flagged, rows 1 and 3 are not", async ({ page }) => {
  await offline(page)
  await page.goto('/flags')
  const rows = page.getByTestId('brief-table').locator('tbody tr')
  await expect(rows).toHaveCount(4, { timeout: 15_000 })
  await expect(rows.nth(0)).toHaveAttribute('data-flagged', 'false')
  await expect(rows.nth(1)).toHaveAttribute('data-flagged', 'true')
  await expect(rows.nth(2)).toHaveAttribute('data-flagged', 'false')
  await expect(rows.nth(3)).toHaveAttribute('data-flagged', 'true')
})

test('scenario 4: nothing sounds in the empty cab; the supervisor is told', async ({ page }) => {
  await offline(page)
  await page.goto('/stage')
  await startScenario(page, '4')
  await expect(page.getByText('EXC001 unattended')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('alert-strip')).toHaveAttribute('data-tier', 'none')
  await expect(page.getByTestId('stage-feed')).toContainText('Unattended Idle', { timeout: 15_000 })
})
