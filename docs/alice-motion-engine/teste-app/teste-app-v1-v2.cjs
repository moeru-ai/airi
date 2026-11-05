// In-app test of V1 and V2 with the Neptuna model.
// Usage: node teste-app-v1-v2.cjs <output dir>
// Needs: the stage-web dev server (BASE_URL), fake-openai-server.cjs on 127.0.0.1:8091, and Playwright.
// The command ends with code 0 when every check passes. See README.md in this folder.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const { chromium } = require('playwright')

const OUT = path.resolve(process.argv[2] ?? 'saida-teste-app')
const AIRI_DIR = process.env.AIRI_DIR ?? path.resolve(__dirname, '..', '..', '..')
// The model to test. The default is Neptuna. VRM_FILE can name another VRM, for example the converted Eva.
const NEPTUNA = process.env.VRM_FILE ?? path.join(AIRI_DIR, 'packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm')
const VRMA = process.env.VRMA_FILE ?? path.join(OUT, 'Happy Spin.vrma')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const FAKE_LOG = process.env.FAKE_LOG ?? path.join(os.tmpdir(), 'airi-fake-openai-requests.jsonl')
const VIDEO = Boolean(process.env.VIDEO)

const startedAt = Date.now()
const steps = []
const consoleLines = []
const state = { page: undefined, browser: undefined, importedListed: false }

function note(message) {
  const line = `[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${message}`
  steps.push(line)
  console.info(line)
}

/** A screenshot takes several seconds with software rendering. With VIDEO, the step is only marked. */
async function capture(page, name, always = false) {
  if (VIDEO && !always) {
    note(`mark ${name}`)
    return
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 120_000 })
  note(`screenshot ${name}`)
}

async function waitForButtons(page, minimum) {
  for (let i = 0; i < 80; i++) {
    if (await page.$$eval('button', buttons => buttons.length) >= minimum)
      return
    await page.waitForTimeout(2000)
  }
}

/** Uses the fake server for the LLM and the voice, and skips the onboarding. */
async function configureProviders(page) {
  // The first load of the Vite dev server compiles the app and can take minutes.
  await page.goto(`${BASE}/`, { timeout: 300_000 })
  await page.evaluate(() => {
    const config = { apiKey: 'sk-test', baseUrl: 'http://127.0.0.1:8091/v1/' }
    const llm = { id: 'openai-compatible', definitionId: 'openai-compatible', config, status: 'configured', configuredBy: 'user' }
    const tts = { id: 'openai-compatible-audio-speech', definitionId: 'openai-compatible-audio-speech', config, status: 'configured', configuredBy: 'user' }
    localStorage.setItem('onboarding/completed', 'true')
    localStorage.setItem('onboarding/skipped', 'false')
    localStorage.setItem('settings/providers/configured', JSON.stringify({ [llm.id]: llm, [tts.id]: tts }))
    localStorage.setItem('settings/providers/added', JSON.stringify({ [llm.id]: true, [tts.id]: true }))
    localStorage.setItem('settings/consciousness/active-provider', llm.id)
    localStorage.setItem('settings/consciousness/active-model', 'fake-model')
    localStorage.setItem('settings/speech/active-provider', tts.id)
    localStorage.setItem('settings/speech/active-model', 'tts-1')
    localStorage.setItem('settings/speech/voice', 'alloy')
  })
}

async function importNeptuna(page) {
  await page.goto(`${BASE}/settings/models`)
  await waitForButtons(page, 4)
  await page.getByRole('button', { name: 'Select model' }).click()
  const importButton = page.locator('[role=dialog] button', { hasText: 'Import' }).first()
  await importButton.waitFor({ timeout: 30000 })
  await importButton.click()
  await page.waitForTimeout(800)
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.getByRole('menuitem', { name: 'VRM' }).click(),
  ])
  await chooser.setFiles(NEPTUNA)
  note('neptuna uploaded')

  const card = page.locator('[role=dialog]').getByText(path.basename(NEPTUNA), { exact: true }).first()
  await card.waitFor({ state: 'attached', timeout: 60000 })
  await card.locator('xpath=ancestor::*[.//button[normalize-space()="Pick"]][1]').getByRole('button', { name: 'Pick' }).click({ force: true })

  // Pick selects the card. Confirm, at the bottom of the dialog, applies it and closes the dialog.
  const confirm = page.locator('[role=dialog] button', { hasText: 'Confirm' }).first()
  for (let i = 0; i < 30 && await page.locator('[role=dialog]').count() > 0; i++) {
    if (await confirm.count() > 0) {
      await confirm.scrollIntoViewIfNeeded().catch(() => {})
      await confirm.click({ timeout: 5000 }).catch(() => {})
    }
    await page.waitForTimeout(1000)
  }
  if (await page.locator('[role=dialog]').count() > 0)
    throw new Error('The model selector did not close after Pick and Confirm')
  note('neptuna picked')
}

/** Imports a VRMA in the Motions section, writes its description, and plays it. */
async function importMotion(page) {
  const button = page.getByRole('button', { name: 'Import motion (.vrma)' })
  await button.waitFor({ timeout: 120000 })
  await button.scrollIntoViewIfNeeded()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), button.click()])
  await chooser.setFiles(VRMA)
  const imported = page.getByTestId('vrm-motions-imported')
  await imported.waitFor({ timeout: 15000 })
  state.importedListed = true
  const description = imported.getByLabel('Description for the LLM').first()
  await description.fill('Spin around with joy')
  await description.press('Tab')
  await page.waitForTimeout(500)
  note(`imported motion name = ${await imported.getByLabel('Name').first().inputValue()}`)
  await imported.getByRole('button', { name: 'Play' }).first().click()
  await page.waitForTimeout(900)
  await capture(page, '01-settings-vrma-play', true)
  await page.getByText('Motions', { exact: true }).first().scrollIntoViewIfNeeded()
  await capture(page, '02-settings-motions-section', true)
}

async function send(page, text) {
  const input = page.locator('textarea').first()
  await input.click()
  await input.fill(text)
  await input.press('Enter')
  note(`sent "${text}"`)
}

async function converse(page) {
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(25000)
  await capture(page, '03-stage-idle', true)
  await page.waitForTimeout(6000)
  await capture(page, '04-stage-idle-later', true)

  // The fake server waits 4 s: she thinks. Then the ACT greeting plays with a happy face, and she speaks.
  await send(page, 'oi, tudo bem?')
  await page.waitForTimeout(2200)
  await capture(page, '05-thinking')
  await page.waitForTimeout(2900)
  await capture(page, '06-reply-greeting-emote')
  await page.waitForTimeout(1500)
  await capture(page, '07-reply-greeting-emote-later')
  await page.waitForTimeout(6000)
  await capture(page, '08-after-reply-happy-rest')

  await send(page, 'fiquei triste hoje')
  await page.waitForTimeout(6000)
  await capture(page, '09-sad')

  // The ACT asks for the imported VRMA by its name.
  await page.waitForTimeout(4000)
  await send(page, 'mostra um pulo')
  await page.waitForTimeout(2600)
  await capture(page, '10-imported-motion')
  await page.waitForTimeout(1200)
  await capture(page, '11-imported-motion-later')
  await page.waitForTimeout(21000)
}

function check() {
  const requests = fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, 'utf8') : ''
  const consoleText = consoleLines.join('\n')
  const checks = {
    'model imported and shown': fs.existsSync(path.join(OUT, '03-stage-idle.png')),
    'imported VRMA listed in the settings': state.importedListed,
    'prompt lists the bundled emotes': requests.includes('- greeting (Greet with a polite bowing motion)'),
    'prompt lists the imported VRMA with its description': requests.includes('- happy_spin (Spin around with joy)'),
    'ACT motion greeting played': consoleText.includes('VRM motion played greeting'),
    'ACT motion happy_spin played': consoleText.includes('VRM motion played happy_spin'),
    'no unknown motion warning': !consoleText.includes('is not in the motion library'),
    'TTS was called (talking clip)': requests.includes('/audio/speech'),
    'no page error': !consoleText.includes('PAGEERROR'),
  }
  fs.writeFileSync(path.join(OUT, 'resultado-checks.json'), JSON.stringify(checks, null, 2))
  for (const [name, ok] of Object.entries(checks))
    note(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  return Object.values(checks).every(Boolean)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  // The test imports a copy of a bundled emote under a new name, so the LLM must find it by the new name.
  if (!process.env.VRMA_FILE)
    fs.copyFileSync(path.join(AIRI_DIR, 'packages/stage-ui-three/src/assets/vrm/animations/utsuwa/emote-spin.vrma'), VRMA)

  const browser = await chromium.launch({ args: [
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ] })
  state.browser = browser
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: VIDEO ? { dir: OUT, size: { width: 1280, height: 800 } } : undefined,
  })
  const page = await context.newPage()
  state.page = page
  page.on('pageerror', error => consoleLines.push(`PAGEERROR ${error.message}`))
  page.on('console', message => consoleLines.push(`${message.type()} ${message.text().slice(0, 400)}`))

  await configureProviders(page)
  await importNeptuna(page)
  await page.waitForTimeout(15000)
  await importMotion(page)
  await converse(page)

  fs.writeFileSync(path.join(OUT, 'console.txt'), consoleLines.join('\n'))
  const passed = check()
  fs.writeFileSync(path.join(OUT, 'steps.txt'), steps.join('\n'))
  await context.close()
  await browser.close()
  process.exitCode = passed ? 0 : 1
}

main().catch(async (error) => {
  console.error('FAILED', error)
  await state.page?.screenshot({ path: path.join(OUT, 'failed.png') }).catch(() => {})
  fs.writeFileSync(path.join(OUT, 'console.txt'), consoleLines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'steps.txt'), `${steps.join('\n')}\nFAILED ${error.stack}`)
  // Close the browser, or the process keeps running after a failure.
  await state.browser?.close().catch(() => {})
  process.exitCode = 1
})
