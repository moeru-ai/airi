// In-app test of the NeoAlice bridge (S08) with the Neptuna model and a real MQTT broker.
// Usage: node teste-ponte-s08.cjs <output dir>
// Needs: the stage-web dev server (BASE_URL), fake-openai-server.cjs on 127.0.0.1:8091 for the voice,
// a broker with a WebSocket listener (BRIDGE_WS_URL) and a TCP listener (PUBLISH_URL), Playwright, and mqtt.
// The script publishes like NeoAlice on a test site. The command ends with code 0 when every check passes.
const { Buffer } = require('node:buffer')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const { chromium } = require('playwright')

const OUT = path.resolve(process.argv[2] ?? 'saida-teste-ponte')
const AIRI_DIR = process.env.AIRI_DIR ?? path.resolve(__dirname, '..', '..', '..')
const NEPTUNA = path.join(AIRI_DIR, 'packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm')
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL ?? 'ws://127.0.0.1:9001'
const PUBLISH_URL = process.env.PUBLISH_URL ?? 'mqtt://127.0.0.1:1883'
/** A test site, so a real NeoAlice and a real mirror on the same broker ignore these messages. */
const SITE = process.env.BRIDGE_SITE ?? 'airi-test'
const FAKE_LOG = process.env.FAKE_LOG ?? path.join(os.tmpdir(), 'airi-fake-openai-requests.jsonl')
const VIDEO = Boolean(process.env.VIDEO)
// The mqtt package of the alice-companion service, so the kit needs no extra install.
const mqtt = require(require.resolve('mqtt', { paths: [path.join(AIRI_DIR, 'services/alice-companion')] }))

const startedAt = Date.now()
const steps = []
const consoleLines = []
const published = []
const state = { page: undefined, browser: undefined }

function note(message) {
  const line = `[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${message}`
  steps.push(line)
  console.info(line)
}

async function capture(page, name, always = false) {
  if (VIDEO && !always) {
    note(`mark ${name}`)
    return
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 120_000 })
  note(`screenshot ${name}`)
}

/** A mono 16 kHz WAV tone in syllable bursts, as base64, like `cmd/tts/audio` carries. */
function toneWavBase64(seconds) {
  const rate = 16000
  const samples = Math.floor(rate * seconds)
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const envelope = Math.max(0, Math.sin(2 * Math.PI * 4 * i / rate))
    buffer.writeInt16LE(Math.round(9000 * envelope * Math.sin(2 * Math.PI * 180 * i / rate)), 44 + i * 2)
  }
  return buffer.toString('base64')
}

async function configure(page) {
  // The first load of the Vite dev server compiles the app and can take minutes.
  await page.goto(`${BASE}/`, { timeout: 300_000 })
  await page.evaluate(({ wsUrl, site }) => {
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
    localStorage.setItem('settings/neoalice-bridge/enabled', 'true')
    localStorage.setItem('settings/neoalice-bridge/broker-url', wsUrl)
    localStorage.setItem('settings/neoalice-bridge/site', site)
    localStorage.setItem('settings/neoalice-bridge/speech-mode', 'airi-voice')
  }, { wsUrl: BRIDGE_WS_URL, site: SITE })
}

async function importNeptuna(page) {
  await page.goto(`${BASE}/settings/models`)
  for (let i = 0; i < 80 && await page.$$eval('button', buttons => buttons.length) < 4; i++)
    await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Select model' }).click()
  const importButton = page.locator('[role=dialog] button', { hasText: 'Import' }).first()
  await importButton.waitFor({ timeout: 30000 })
  await importButton.click()
  await page.waitForTimeout(800)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.getByRole('menuitem', { name: 'VRM' }).click()])
  await chooser.setFiles(NEPTUNA)
  const card = page.locator('[role=dialog]').getByText('neptuna.vrm', { exact: true }).first()
  await card.waitFor({ state: 'attached', timeout: 60000 })
  await card.locator('xpath=ancestor::*[.//button[normalize-space()="Pick"]][1]').getByRole('button', { name: 'Pick' }).click({ force: true })
  const confirm = page.locator('[role=dialog] button', { hasText: 'Confirm' }).first()
  for (let i = 0; i < 30 && await page.locator('[role=dialog]').count() > 0; i++) {
    if (await confirm.count() > 0) {
      await confirm.scrollIntoViewIfNeeded().catch(() => {})
      await confirm.click({ timeout: 5000 }).catch(() => {})
    }
    await page.waitForTimeout(1000)
  }
  note('neptuna picked')
}

function publisher() {
  const client = mqtt.connect(PUBLISH_URL, { clientId: `neoalice-test-publisher-${process.pid}` })
  const ready = new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('error', reject)
  })
  const publish = async (site, action, payload) => {
    const topic = `neoalice/v1/${site}/${action}`
    await client.publishAsync(topic, JSON.stringify(payload))
    published.push(topic)
    note(`published ${topic}`)
  }
  return { client, ready, publish }
}

async function bridgeStatus(page) {
  await page.goto(`${BASE}/settings/modules/neoalice-bridge`)
  const status = page.getByTestId('neoalice-bridge-status')
  await status.waitFor({ timeout: 60000 })
  for (let i = 0; i < 30 && !(await status.textContent() ?? '').includes('Connected'); i++)
    await page.waitForTimeout(1000)
  await capture(page, '01-bridge-settings', true)
  return (await status.textContent()) ?? ''
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ args: [
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ] })
  state.browser = browser
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: VIDEO ? { dir: OUT, size: { width: 1280, height: 800 } } : undefined })
  const page = await context.newPage()
  state.page = page
  page.on('pageerror', error => consoleLines.push(`PAGEERROR ${error.message}`))
  page.on('console', message => consoleLines.push(`${message.type()} ${message.text().slice(0, 400)}`))

  await configure(page)
  await importNeptuna(page)
  const statusText = await bridgeStatus(page)
  note(`bridge status: ${statusText.replace(/\s+/g, ' ')}`)

  await page.goto(`${BASE}/`)
  await page.waitForTimeout(25000)
  await capture(page, '02-stage-idle', true)

  const neoAlice = publisher()
  await neoAlice.ready
  await neoAlice.publish(SITE, 'evt/mood', { mood: 'playful', intensity: 80 })
  await page.waitForTimeout(3000)
  await neoAlice.publish(SITE, 'evt/stt/final', { text: 'oi alice' })
  await page.waitForTimeout(2500)
  await capture(page, '03-thinking')
  await neoAlice.publish(SITE, 'cmd/tts/say', { text: 'Hello! It is so nice to see you again.', session_id: 'turn-1' })
  await page.waitForTimeout(3000)
  await capture(page, '04-speaking-airi-voice')
  await page.waitForTimeout(4000)
  await neoAlice.publish(SITE, 'cmd/avatar/gesture', { gesture: 'index', duration: 3 })
  await page.waitForTimeout(1500)
  await capture(page, '05-gesture-index')
  await page.waitForTimeout(4000)
  await neoAlice.publish(SITE, 'evt/mood', { mood: 'melancholic' })
  await neoAlice.publish(SITE, 'cmd/tts/audio', { audio: { b64: toneWavBase64(4) }, text: 'This audio came from NeoAlice.', session_id: 'turn-2' })
  await page.waitForTimeout(2500)
  await capture(page, '06-sad-neoalice-audio')
  await neoAlice.publish(SITE, 'cmd/tts/stop', {})
  await page.waitForTimeout(2000)
  await neoAlice.publish('another-site', 'cmd/tts/say', { text: 'This must be ignored.' })
  await neoAlice.publish(SITE, 'cmd/avatar/gesture', { gesture: 'moonwalk' })
  await page.waitForTimeout(3000)
  await capture(page, '07-after-stop', true)
  await neoAlice.client.endAsync()

  const finalStatus = await bridgeStatus(page)
  note(`bridge status at the end: ${finalStatus.replace(/\s+/g, ' ')}`)
  fs.writeFileSync(path.join(OUT, 'console.txt'), consoleLines.join('\n'))

  const requests = fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, 'utf8') : ''
  const consoleText = consoleLines.join('\n')
  const checks = {
    'bridge connected': statusText.includes('Connected'),
    'AIRI voice spoke the cmd/tts/say text': requests.includes('Hello! It is so nice to see you again.'),
    'gesture index played as the shoot clip': consoleText.includes('played gesture_index as clip shoot'),
    'unknown gesture refused with a reason': consoleText.includes(`ignored neoalice/v1/${SITE}/cmd/avatar/gesture: the catalog has no action for this command`),
    // The subscription has only the bridge site, so the broker never delivers another site.
    'another site never spoken': !requests.includes('This must be ignored.') && !consoleText.includes('This must be ignored.'),
    'no page error': !consoleText.includes('PAGEERROR'),
  }
  fs.writeFileSync(path.join(OUT, 'resultado-checks.json'), JSON.stringify(checks, null, 2))
  for (const [name, ok] of Object.entries(checks))
    note(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  fs.writeFileSync(path.join(OUT, 'steps.txt'), steps.join('\n'))
  await context.close()
  await browser.close()
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1
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
