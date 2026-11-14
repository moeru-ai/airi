import assert from 'node:assert/strict'
import process from 'node:process'

import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { binaryPath } from '@auv-js/cli/binary'
import { createAuv, startAuv } from '@auv-js/sdk/node'

/**
 * Runs bounded executor research in a disposable, noninteractive window station.
 *
 * Call stack:
 * run-executor -> station-launcher -> isolated Node worker
 *   -> real AUV CLI -> isolated Win32 receivers -> independent Oracle
 *   -> independent UIAutomation probe, separately labeled
 * The outer witness stays on the user's desktop. No SendInput experiment runs.
 */
const scriptRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptRoot, '../..')
const repoRoot = resolve(appRoot, '../..')
const worker = process.argv[2] === '--isolated-worker'
const root = resolve(process.argv[worker ? 3 : 2] ?? '')
assert.equal(process.platform, 'win32')
assert.ok(process.argv[worker ? 3 : 2] && isAbsolute(process.argv[worker ? 3 : 2]))
const fromRepo = relative(repoRoot, root)
assert.ok(fromRepo.startsWith(`..${sep}`) || isAbsolute(fromRepo), 'Evidence must stay outside the repository.')
const launcher = join(root, 'station-launcher.exe')
const uia = join(root, 'uia-probe.exe')

function start(file, args, options = {}) {
  const { lifetimeMs = 30000, stdin = '', ...spawnOptions } = options
  const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...spawnOptions })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  child.stdout.setEncoding('utf8').on('data', value => stdout += value)
  child.stderr.setEncoding('utf8').on('data', value => stderr += value)
  child.stdin.on('error', () => {})
  child.stdin.end(stdin)
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, lifetimeMs)
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr, timedOut }))
  }).finally(() => clearTimeout(timeout))
  return { child, done }
}

async function json(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function awaitJson(path, accept = () => true) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      const value = await json(path)
      if (accept(value))
        return value
    }
    catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error
    }
    await delay(10)
  }
  throw new Error(`Fixture did not publish the required receipt: ${path}`)
}

async function runWorker() {
  const commands = []
  const cases = []
  const fixtures = []
  let sequence = 0
  let daemon
  let connection
  const launchIdentity = await start(launcher, ['--probe', join(root, 'worker-isolation.json')]).done
  assert.equal(launchIdentity.exitCode, 0)
  const isolation = await json(join(root, 'worker-isolation.json'))
  assert.equal(isolation.stationVisible, false)
  assert.equal(isolation.canOpenInputDesktop, false)
  assert.equal(isolation.desktop, 'Harness')
  assert.ok(isolation.station.startsWith('airi-phase3b2a-'))

  async function state(fixture) {
    const result = await awaitJson(join(fixture.directory, 'state.json'), value => value.pid === fixture.child.pid)
    assert.equal(result.station, isolation.station)
    assert.equal(result.desktop, 'Harness')
    return result
  }
  async function request(fixture, command, extra = {}) {
    sequence++
    await writeFile(join(fixture.directory, 'request.json'), JSON.stringify({ sequence, command, ...extra }))
    return awaitJson(join(fixture.directory, 'state.json'), value => value.pid === fixture.child.pid && value.sequence === sequence)
  }
  async function launch(label, index = 1) {
    const directory = join(root, `${label}-${index}`)
    await mkdir(directory)
    const child = spawn(join(root, `${label}.exe`), [directory, label], { windowsHide: true, stdio: 'ignore' })
    const fixture = { label, directory, child, done: new Promise(resolve => child.once('exit', exitCode => resolve(exitCode))) }
    fixtures.push(fixture)
    await state(fixture)
    return fixture
  }
  async function invoke(name, argv) {
    assert.ok(argv.includes('--no-overlay'))
    assert.ok(argv[1] === 'window.list' || argv.includes('--target'), 'No global input experiment is admitted.')
    if (argv[1] === 'input.clickPoint')
      assert.equal(argv[argv.indexOf('--input-policy') + 1], 'background-only')
    const args = [...argv, '--json', '--store-root', join(root, 'auv-store')]
    const result = await start(binaryPath(), args, { lifetimeMs: 8000, env: { ...process.env, AUV_ENDPOINT: undefined, AUV_CONTEXT: undefined } }).done
    const record = { name, args, ...result }
    try {
      record.output = JSON.parse(result.stdout)
    }
    catch {
      record.output = null
    }
    commands.push(record)
    await writeFile(join(root, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`)
    return record
  }
  async function click(name, target, point = target.buttonPoint) {
    return invoke(name, ['invoke', 'input.clickPoint', String(point.x), String(point.y), '--target', `window:${target.root.hwnd}`, '--relative-to', 'window', '--input-policy', 'background-only', '--click-count', '1', '--no-overlay'])
  }
  async function observe(name, beforeA, beforeB, command, a, b, extra = {}) {
    const result = { name, evidence: 'real AUV CLI and independent Win32 receivers', beforeA, beforeB, command, nativeDeliveryVerified: false, limitation: 'Input-desktop attachment blocks the native click boundary. Zero receiver events do not prove lifecycle rejection.', afterA: await request(a, 'snapshot'), afterB: await request(b, 'snapshot'), ...extra }
    cases.push(result)
    await writeFile(join(root, 'cases.json'), `${JSON.stringify(cases, null, 2)}\n`)
    return result
  }
  async function reset(a) {
    return request(a, 'replace')
  }
  async function semantic(name, mode, target, value) {
    const output = join(root, `${name}.json`)
    const result = await start(uia, [output, mode, target.root.hwnd, String(target.root.pid), ...(value ? [value] : [])], { lifetimeMs: 8000 }).done
    return { name, result, receipt: await json(output).catch(error => ({ error: String(error) })), executor: 'independent UIAutomation, not AUV' }
  }

  try {
    let a = await launch('target-a')
    const b = await launch('target-b')
    const initialA = await state(a)
    const initialB = await state(b)
    assert.notEqual(initialA.pid, initialB.pid)
    const list = await invoke('private-desktop-enumeration', ['invoke', 'window.list', '--no-overlay'])
    await writeFile(join(root, 'initial-oracle.json'), JSON.stringify({ isolation, initialA, initialB, list }, null, 2))
    // This experiment records the installed release's isolation failure.
    // A release with different desktop behavior needs a separate admission review.
    assert.equal(list.exitCode, 1)
    assert.match(list.output.failure, /input desktop attachment failed: Failed to open input desktop/)

    let beforeA = await request(a, 'snapshot')
    let beforeB = await request(b, 'snapshot')
    await observe('exact-background-click-blocked', beforeA, beforeB, await click('exact-background-click', beforeA.windows.at(-1)), a, b)

    beforeA = await reset(a)
    beforeB = await request(b, 'focus-editor')
    await observe('other-process-thread-focus', beforeA, beforeB, await click('other-process-thread-focus', beforeA.windows.at(-1)), a, b, { focusScope: 'private GUI-thread focus only. This station has no interactive foreground.' })

    beforeA = await reset(a)
    beforeB = await request(b, 'snapshot')
    const oldPoint = beforeA.windows.at(-1).buttonPoint
    const swapped = await request(a, 'swap-controls')
    await observe('stale-point-wrong-control', beforeA, beforeB, await click('stale-point-wrong-control', swapped.windows.at(-1), oldPoint), a, b, { swapped })

    beforeA = await reset(a)
    beforeB = await request(b, 'snapshot')
    const childReplacement = await request(a, 'replace-child')
    await observe('same-root-replaced-child', beforeA, beforeB, await click('same-root-replaced-child', beforeA.windows.at(-1)), a, b, { childReplacement })

    for (const afterPause of ['none', 'close', 'replace-child']) {
      beforeA = await reset(a)
      beforeB = await request(b, 'snapshot')
      const target = beforeA.windows.at(-1)
      const paused = await request(a, 'pause', { afterPause })
      assert.equal(paused.paused, true)
      const command = await click(`receiver-delay-${afterPause}`, target)
      const beforeRelease = await state(a)
      await writeFile(join(a.directory, 'pause-release'), 'release')
      await observe(`receiver-delay-${afterPause}`, beforeA, beforeB, command, a, b, { paused, beforeRelease })
    }

    beforeA = await reset(a)
    const oldRoot = beforeA.windows.at(-1)
    await request(a, 'close')
    beforeB = await request(b, 'snapshot')
    await observe('closed-root', beforeA, beforeB, await click('closed-root', oldRoot), a, b)
    const replacement = await reset(a)
    await observe('same-process-recreated-root', beforeA, beforeB, await click('same-process-recreated-root', oldRoot), a, b, { replacement, actualHandleReused: oldRoot.root.hwnd === replacement.windows.at(-1).root.hwnd })

    const dead = await request(a, 'stop')
    await a.done
    a = await launch('target-a', 2)
    beforeA = await request(a, 'snapshot')
    beforeB = await request(b, 'snapshot')
    await observe('different-process-recreated-root', beforeA, beforeB, await click('different-process-recreated-root', replacement.windows.at(-1)), a, b, { priorProcess: dead })

    for (const targetKind of ['window', 'app']) {
      for (const policy of ['background-only', 'foreground-preferred']) {
        for (const kind of ['text', 'shortcut']) {
          beforeA = await reset(a)
          beforeB = await request(b, 'focus-editor')
          const target = beforeA.windows.at(-1)
          const argv = kind === 'text' ? ['invoke', 'input.typeText', 'fixture-text'] : ['invoke', 'input.key', 'ctrl+k']
          const targetArg = targetKind === 'window' ? `window:${target.root.hwnd}` : 'app:target-a.exe'
          const name = `targeted-${kind}-${targetKind}-${policy}`
          const command = await invoke(name, [...argv, '--target', targetArg, '--input-policy', policy, '--no-overlay'])
          await observe(name, beforeA, beforeB, command, a, b, { limitation: 'Explicit keyboard targets must reject. No untargeted SendInput test runs.' })
        }
      }
    }

    beforeA = await reset(a)
    beforeB = await request(b, 'snapshot')
    await observe('application-activation', beforeA, beforeB, await invoke('application-activation', ['invoke', 'app.activate', '--target', 'app:target-a.exe', '--no-overlay']), a, b, { scope: 'noninteractive station only. No interactive activation guarantee follows.' })

    // This pipe holds transport admission. It never forwards bytes to a daemon.
    // Terminating the waiting CLI does not test cancellation after native dispatch.
    beforeA = await request(a, 'snapshot')
    beforeB = await request(b, 'snapshot')
    const pipeName = `airi-phase3b2a-${randomUUID()}`
    const sockets = []
    let entered
    let receivedBytes = 0
    const admission = new Promise(resolve => entered = resolve)
    const gate = createServer((socket) => {
      sockets.push(socket)
      socket.on('error', () => {})
      socket.on('data', (bytes) => {
        receivedBytes += bytes.length
        entered()
      })
    })
    await new Promise((resolve, reject) => {
      gate.once('error', reject)
      gate.listen(`\\\\.\\pipe\\${pipeName}`, resolve)
    })
    const barrierArgs = ['--credential-stdin', '--run', '00000000-0000-0000-0000-000000000000', 'invoke', 'input.clickPoint', '1', '1', '--target', `window:${beforeA.windows.at(-1).root.hwnd}`, '--relative-to', 'window', '--input-policy', 'background-only', '--click-count', '1', '--no-overlay', '--json', '--store-root', join(root, 'barrier-store')]
    const pending = start(binaryPath(), barrierArgs, { lifetimeMs: 8000, stdin: 'phase3b2a-test-credential\n', env: { ...process.env, AUV_CONTEXT: undefined, AUV_ENDPOINT: `npipe://./pipe/${pipeName}` } })
    try {
      await Promise.race([admission, pending.done.then(() => {
        throw new Error('CLI exited before the transport barrier.')
      })])
      assert.equal(pending.child.exitCode, null)
      assert.equal(pending.child.kill(), true)
      const terminated = await pending.done
      const receipt = { args: barrierArgs, receivedBytes, forwardedBytes: 0, ...terminated, scope: 'Controlled endpoint with a real selected CLI. Parent process termination before daemon admission.' }
      await writeFile(join(root, 'transport-barrier.json'), JSON.stringify(receipt, null, 2))
      await observe('delayed-endpoint-client-terminated', beforeA, beforeB, null, a, b, { transport: receipt, limitation: 'No native request reaches a daemon. This does not establish cancellation after native start.' })
    }
    finally {
      if (pending.child.exitCode === null)
        pending.child.kill()
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => gate.close(resolve))
    }

    beforeA = await reset(a)
    await request(a, 'swap-controls')
    const read = await semantic('uia-read', 'read', beforeA.windows.at(-1))
    const probes = [read]
    if (read.receipt.completed) {
      probes.push(await semantic('uia-invoke', 'invoke', beforeA.windows.at(-1)))
      probes.push(await semantic('uia-value', 'value', beforeA.windows.at(-1), 'semantic-fixture-value'))
    }
    await observe('independent-uia-capability', beforeA, await request(b, 'snapshot'), null, a, b, { probes, limitation: 'Independent UIAutomation capability only. It is not an AUV delivery or lifetime guarantee.' })

    // Startup is observed separately. AUV invoke without a resource selector remains local.
    const daemonEntered = Date.now()
    const daemonReceipt = { scope: 'Real isolated daemon. Only health, discovery, and window enumeration are requested.', calls: [] }
    try {
      daemon = await startAuv({ binaryPath: binaryPath(), noRegister: true, overlay: false, storeRoot: join(root, 'daemon-store'), startupTimeoutMs: 8000 })
      connection = await daemon.connect()
      const api = createAuv(connection)
      daemonReceipt.elapsedMs = Date.now() - daemonEntered
      daemonReceipt.endpoints = daemon.endpoints
      daemonReceipt.pid = daemon.pid
      const call = async (name, operation) => {
        try {
          daemonReceipt.calls.push({ name, result: await operation() })
        }
        catch (error) {
          daemonReceipt.calls.push({ name, error: String(error) })
        }
      }
      await call('health', () => api.health.check())
      await call('runner-classes', () => api.runners.listClasses())
      const runner = api.runner({ runnerClass: 'auv.core.local' })
      await call('runner-window-list', () => runner.windows.list())
      const canceled = new AbortController()
      canceled.abort(new Error('Fixture cancellation before dispatch'))
      await call('runner-window-list-pre-canceled', () => runner.windows.list({ signal: canceled.signal }))
    }
    catch (error) { daemonReceipt.error = String(error) }
    await writeFile(join(root, 'daemon-readonly.json'), JSON.stringify(daemonReceipt, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))

    const finalA = await request(a, 'snapshot')
    const finalB = await request(b, 'snapshot')
    await writeFile(join(root, 'worker-summary.json'), JSON.stringify({ isolation, cases: cases.length, commands: commands.length, finalA, finalB, globalKeyboardExecuted: false, inputDesktopSwitched: false, nativeWriteAdmission: 'NO-GO' }, null, 2))
  }
  finally {
    await connection?.close()
    await daemon?.stop()
    for (const fixture of fixtures) {
      await writeFile(join(fixture.directory, 'pause-release'), 'release').catch(() => {})
      if (fixture.child.exitCode === null) {
        await request(fixture, 'stop').catch(() => {})
        const exited = await Promise.race([fixture.done.then(() => true), delay(2000).then(() => false)])
        if (!exited)
          fixture.child.kill()
      }
    }
    await writeFile(join(root, 'worker-cleanup.json'), JSON.stringify(fixtures.map(f => ({ label: f.label, pid: f.child.pid, exitCode: f.child.exitCode })), null, 2))
  }
}

async function runOuter() {
  await mkdir(root, { recursive: true })
  assert.equal((await readdir(root)).length, 0, 'Use an empty evidence directory.')
  const framework = join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
  const compiler = join(framework, 'csc.exe')
  const compile = async (name, source, references) => {
    const result = await start(compiler, ['/nologo', '/target:winexe', `/out:${join(root, name)}`, ...references.map(ref => `/r:${ref}`), source]).done
    await writeFile(join(root, `${name}-compile.json`), JSON.stringify(result, null, 2))
    assert.equal(result.exitCode, 0, result.stdout + result.stderr)
  }
  await compile('station-launcher.exe', join(scriptRoot, 'station-launcher.cs'), ['System.Web.Extensions.dll'])
  await compile('target-a.exe', join(scriptRoot, '../phase3-harness/native-harness.cs'), ['System.Web.Extensions.dll', 'System.Windows.Forms.dll', 'System.Drawing.dll'])
  await copyFile(join(root, 'target-a.exe'), join(root, 'target-b.exe'))
  await compile('uia-probe.exe', join(scriptRoot, 'uia-probe.cs'), ['System.Web.Extensions.dll', join(framework, 'WPF', 'UIAutomationClient.dll'), join(framework, 'WPF', 'UIAutomationTypes.dll'), join(framework, 'WPF', 'WindowsBase.dll')])
  const identities = []
  for (const name of ['station-launcher.exe', 'target-a.exe', 'target-b.exe', 'uia-probe.exe'])
    identities.push({ name, sha256: createHash('sha256').update(await readFile(join(root, name))).digest('hex') })
  identities.push({ name: binaryPath(), sha256: createHash('sha256').update(await readFile(binaryPath())).digest('hex') })
  await writeFile(join(root, 'binary-identities.json'), JSON.stringify(identities, null, 2))
  assert.equal(identities.at(-1).sha256, '590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678', 'Review another AUV binary before it runs.')
  const witness = start(launcher, ['--witness', root], { lifetimeMs: 180000 })
  await awaitJson(join(root, 'witness-ready.json'))
  let result
  try {
    result = await start(launcher, [root, process.execPath, fileURLToPath(import.meta.url), appRoot], { lifetimeMs: 155000 }).done
  }
  finally {
    await writeFile(join(root, 'witness-stop'), 'stop')
    await witness.done
  }
  const receipt = await json(join(root, 'isolation-receipt.json'))
  const closed = await start(launcher, ['--verify-closed', receipt.stationName, join(root, 'station-closed.json')]).done
  await writeFile(join(root, 'outer-result.json'), JSON.stringify({ result, stationClosed: closed, interactive: await json(join(root, 'interactive-witness.json')) }, null, 2))
  assert.equal(result.exitCode, 0, JSON.stringify(receipt))
  assert.equal(closed.exitCode, 0, 'The owned window station still exists after its processes exited.')
  console.info(JSON.stringify({ nativeWriteAdmission: 'NO-GO', evidence: root, ...(await json(join(root, 'worker-summary.json'))).isolation }))
}

try {
  if (worker)
    await runWorker()
  else
    await runOuter()
}
catch (error) {
  await writeFile(join(root, worker ? 'worker-error.json' : 'outer-error.json'), JSON.stringify({ error: String(error), stack: error.stack }, null, 2))
  process.exitCode = 1
}
