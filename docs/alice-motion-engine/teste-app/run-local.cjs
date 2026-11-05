// Local AIRI smoke or V1/V2 integration test. No production MQTT connections.
// node docs/alice-motion-engine/teste-app/run-local.cjs [smoke|v1v2] [output-directory]
'use strict'
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')
const root = path.resolve(__dirname, '../../..')
const mode = process.argv[2] || 'smoke'
const out = path.resolve(process.argv[3] || 'saida-' + mode)
const webPort = Number(process.env.AIRI_TEST_PORT || 5173)
const fakePort = Number(process.env.FAKE_OPENAI_PORT || 8091)
const base = 'http://127.0.0.1:' + webPort
const fakeBase = 'http://127.0.0.1:' + fakePort + '/v1/'
const children = []
function say(message) { console.log('[airi-test] ' + message) }
function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1200, () => { socket.destroy(); resolve(false) })
  })
}
async function get(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
    return { ok: response.ok, text: await response.text() }
  }
  catch { return { ok: false, text: '' } }
}
function start(name, cmd, args, env = {}) {
  const file = fs.createWriteStream(path.join(out, name + '.log'))
  const child = spawn(cmd, args, {
    cwd: root, env: { ...process.env, ...env }, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(file)
  child.stderr.pipe(file)
  child.on('error', error => say(name + ': ' + error.message))
  children.push(child)
  say(name + ' iniciado; log: ' + path.join(out, name + '.log'))
  return child
}
async function ready(url, pattern, ms, child) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (child && child.exitCode !== null)
      throw new Error('Processo terminou antes de ficar pronto: ' + url + ', exit=' + child.exitCode)
    const result = await get(url)
    if (result.ok && result.text.includes(pattern)) return
    await sleep(1500)
  }
  throw new Error('Tempo esgotado aguardando ' + url)
}
function getChromium() {
  let chromium
  try { chromium = require('playwright').chromium }
  catch { throw new Error('Falta Playwright: execute pnpm install --frozen-lockfile na raiz do AIRI') }
  if (!fs.existsSync(chromium.executablePath()))
    throw new Error('Falta Chromium: execute pnpm exec playwright install chromium')
  return chromium
}
async function smoke(chromium) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push('PAGEERROR ' + error.stack))
    page.on('requestfailed', request => errors.push('NETWORK ' + request.url() + ' ' + request.failure()?.errorText))
    page.on('console', message => { if (message.type() === 'error') errors.push('CONSOLE ' + message.text()) })
    page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url()) })
    let loaded = false
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.waitForFunction(() => document.querySelector('#app')?.childElementCount > 0, undefined, { timeout: 90000 })
      loaded = true
    }
    catch (error) { errors.push('BOOT ' + error.stack) }
    await page.screenshot({ path: path.join(out, 'smoke.png'), timeout: 60000 }).catch(error => errors.push('SCREENSHOT ' + error.message))
    fs.writeFileSync(path.join(out, 'smoke-result.json'), JSON.stringify({ loaded, url: page.url(), errors }, null, 2))
    say('Renderização: ' + (loaded ? 'OK' : 'FALHOU') + '; erros: ' + errors.length)
    if (!loaded || errors.some(x => x.startsWith('PAGEERROR')))
      throw new Error('Falha de renderização: veja smoke.png e smoke-result.json')
  }
  finally { await browser.close() }
}
async function main() {
  if (!['smoke', 'v1v2'].includes(mode)) throw new Error('Use smoke ou v1v2')
  if (![webPort, fakePort].every(x => Number.isInteger(x) && x >= 1024 && x <= 65535) || webPort === fakePort)
    throw new Error('Portas inválidas ou iguais')
  fs.mkdirSync(out, { recursive: true })
  const pkg = path.join(root, 'package.json')
  if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).name !== '@proj-airi/root')
    throw new Error('Execute a partir da árvore do AIRI; raiz detectada: ' + root)
  const chromium = getChromium()
  if (await isPortOpen(webPort)) {
    const check = await get(base)
    if (!check.ok || !check.text.includes('id="app"')) throw new Error('Porta ' + webPort + ' ocupada por outro serviço')
    say('Reutilizando Vite já aberto em ' + base)
  }
  else {
    const pnpm = process.env.PNPM_EXECUTABLE || 'pnpm'
    const found = spawnSync(pnpm, ['--version'], { timeout: 10000, encoding: 'utf8' })
    if (found.error || found.status !== 0) throw new Error('pnpm não encontrado; instale pnpm 11.24.0')
    const child = start('vite', pnpm, ['-F', '@proj-airi/stage-web', 'exec', 'vite', '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'])
    await ready(base, 'id="app"', 180000, child)
  }
  if (mode === 'smoke') { await smoke(chromium); return }
  if (await isPortOpen(fakePort)) throw new Error('Porta ' + fakePort + ' ocupada; não sobrescrever outro servidor')
  const fakeLog = path.join(out, 'fake-requests.jsonl')
  const mock = start('fake', process.execPath, [path.join(__dirname, 'fake-openai-server.cjs')], {
    FAKE_LOG: fakeLog, FAKE_OPENAI_PORT: String(fakePort),
  })
  await ready(fakeBase + 'models', 'fake-model', 15000, mock)
  const test = start('playwright', process.execPath, [path.join(__dirname, 'teste-app-v1-v2.cjs'), out], {
    BASE_URL: base, FAKE_OPENAI_BASE_URL: fakeBase, FAKE_LOG: fakeLog,
  })
  const result = await new Promise((resolve, reject) => {
    test.once('error', reject)
    test.once('exit', (code, signal) => resolve(code === null ? 1 : code))
  })
  if (result !== 0) throw new Error('Playwright falhou (exit=' + result + '); ver playwright.log e steps.txt')
  say('V1/V2 concluído. Resultado: ' + path.join(out, 'resultado-checks.json'))
}
async function cleanup() {
  for (const child of children.reverse()) {
    if (!child.pid || child.exitCode !== null) continue
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    }
    catch (error) { if (error.code !== 'ESRCH') say('Cleanup: ' + error.message) }
  }
  await sleep(500)
}
main().catch(error => { console.error('[airi-test] FALHOU:', error.stack); process.exitCode = 1 })
  .finally(async () => { await cleanup(); say('Artefatos: ' + out) })
