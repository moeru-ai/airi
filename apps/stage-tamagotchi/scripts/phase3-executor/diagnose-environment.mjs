import assert from 'node:assert/strict'
import process from 'node:process'

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { binaryPath } from '@auv-js/cli/binary'
import { createAuv, startAuv } from '@auv-js/sdk/node'

// This runner records context and resolves one owned window. It has no input call.
const execute = promisify(execFile)
const scriptRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptRoot, '../..')
const repoRoot = resolve(appRoot, '../..')
const worker = process.argv[2] === '--isolated-worker'
const argument = process.argv[worker ? 3 : 2]
assert.equal(process.platform, 'win32')
assert.ok(argument && isAbsolute(argument))
const root = resolve(argument)
const artifactRoot = worker ? dirname(root) : root
const relativeRoot = relative(repoRoot, root)
assert.ok(relativeRoot.startsWith(`..${sep}`) || isAbsolute(relativeRoot))
const launcher = join(artifactRoot, 'station-launcher.exe')
const probe = join(artifactRoot, 'environment-probe.exe')
const jsonText = value => `${JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2)}\n`
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))

async function run(file, args, extra = {}) {
  try {
    const result = await execute(file, args, { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024, ...extra })
    return { file, args, exitCode: 0, ...result }
  }
  catch (error) {
    return { file, args, exitCode: error.code, signal: error.signal, killed: error.killed, stdout: error.stdout, stderr: error.stderr, error: String(error) }
  }
}

async function ready(path, accept = () => true) {
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
  throw new Error(`No required diagnostic receipt: ${path}`)
}

async function diagnose(directory) {
  const fixtures = []
  const calls = []
  let sequence = 0
  let daemon
  let connection
  async function request(fixture, command) {
    assert.ok(command === 'snapshot' || command === 'stop')
    sequence++
    await writeFile(join(fixture.directory, 'request.json'), jsonText({ sequence, command }))
    return ready(join(fixture.directory, 'state.json'), state => state.pid === fixture.child.pid && state.sequence === sequence)
  }
  async function record(name, operation) {
    try {
      const result = await operation()
      calls.push({ name, result })
      return result
    }
    catch (error) {
      calls.push({ name, error: String(error) })
    }
    finally {
      await writeFile(join(directory, 'auv-read-calls.json'), jsonText(calls))
    }
  }
  try {
    for (const label of ['a', 'b']) {
      const fixtureRoot = join(directory, `target-${label}`)
      await mkdir(fixtureRoot)
      const child = spawn(join(artifactRoot, `b2b-target-${label}.exe`), [fixtureRoot, label], { windowsHide: true, stdio: 'ignore' })
      const done = new Promise((resolve, reject) => {
        child.once('exit', code => resolve(code))
        child.once('error', reject)
      })
      const fixture = { directory: fixtureRoot, child, done }
      fixtures.push(fixture)
      fixture.initial = await ready(join(fixtureRoot, 'state.json'), state => state.pid === child.pid)
    }
    daemon = await startAuv({ binaryPath: binaryPath(), noRegister: true, overlay: false, storeRoot: join(directory, 'daemon-store'), startupTimeoutMs: 8000 })
    connection = await daemon.connect()
    const api = createAuv(connection)
    await record('health', () => api.health.check())
    const runner = api.runner({ runnerClass: 'auv.core.local' })
    const target = fixtures[0].initial
    await record('resolve-owned-target-a', async () => {
      const window = await runner.windows.resolve({ pid: target.pid })
      assert.equal(window.id, target.windows.at(-1).root.hwnd)
      return { id: window.id, window: window.window }
    })
    const runners = await api.runners.list()
    await writeFile(join(directory, 'owned-auv-processes.json'), jsonText({ daemonPid: daemon.pid, runners: runners.map(runner => ({ id: runner.id, processId: runner.processId, runnerClass: runner.runnerClass, phase: runner.phase })) }))
    const pids = [...new Set([daemon.pid, ...runners.map(runner => runner.processId), ...fixtures.map(fixture => fixture.child.pid)].filter(pid => pid > 0))]
    const hwnds = fixtures.map(fixture => fixture.initial.windows.at(-1).root.hwnd)
    const result = await run(probe, [join(directory, 'native-context.json'), ...pids.flatMap(pid => ['--pid', String(pid)]), ...hwnds.flatMap(hwnd => ['--hwnd', hwnd])])
    await writeFile(join(directory, 'native-probe-call.json'), jsonText(result))
    assert.equal(result.exitCode, 0, result.stdout + result.stderr)
    const native = await json(join(directory, 'native-context.json'))
    assert.equal(native.windows.length, 2)
    for (const fixture of fixtures) {
      const window = native.windows.find(window => window.hwnd === fixture.initial.windows.at(-1).root.hwnd)
      assert.equal(window.exists, true)
      assert.equal(window.pid, fixture.child.pid)
    }
    const final = []
    for (const fixture of fixtures) final.push(await request(fixture, 'snapshot'))
    await writeFile(join(directory, 'receiver-observation.json'), jsonText({ initial: fixtures.map(fixture => fixture.initial), final }))
    return { native, calls }
  }
  finally {
    const cleanup = []
    try {
      await connection?.close()
    }
    finally {
      try {
        await daemon?.stop()
      }
      finally {
        for (const fixture of fixtures) {
          if (fixture.child.exitCode === null) {
            await request(fixture, 'stop').catch(() => {})
            if (!await Promise.race([fixture.done.then(() => true), delay(2000).then(() => false)]))
              fixture.child.kill()
          }
          cleanup.push({ pid: fixture.child.pid, exitCode: await fixture.done })
        }
        await writeFile(join(directory, 'cleanup.json'), jsonText(cleanup))
      }
    }
  }
}

async function outer() {
  await mkdir(root, { recursive: true })
  assert.equal((await readdir(root)).length, 0, 'Use an empty evidence directory.')
  const compiler = join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  const inputs = [
    ['station-launcher.exe', join(scriptRoot, 'station-launcher.cs'), ['System.Web.Extensions.dll']],
    ['environment-probe.exe', join(scriptRoot, 'environment-probe.cs'), ['System.Web.Extensions.dll']],
    ['b2b-target-a.exe', join(scriptRoot, '../phase3-harness/native-harness.cs'), ['System.Web.Extensions.dll', 'System.Windows.Forms.dll', 'System.Drawing.dll']],
  ]
  const builds = []
  for (const [name, source, references] of inputs) {
    const result = await run(compiler, ['/nologo', '/target:winexe', `/out:${join(root, name)}`, ...references.map(ref => `/r:${ref}`), source])
    builds.push({ source, sourceSha256: createHash('sha256').update(await readFile(source)).digest('hex'), ...result })
    await writeFile(join(root, 'compile-calls.json'), jsonText(builds))
    assert.equal(result.exitCode, 0, result.stdout + result.stderr)
  }
  await copyFile(join(root, 'b2b-target-a.exe'), join(root, 'b2b-target-b.exe'))
  const binaries = []
  for (const path of [binaryPath(), ...['station-launcher.exe', 'environment-probe.exe', 'b2b-target-a.exe', 'b2b-target-b.exe'].map(name => join(root, name))])
    binaries.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
  await writeFile(join(root, 'binary-identities.json'), jsonText(binaries))
  assert.equal(binaries[0].sha256, '590e629266202147876f92e28d6d01edd94522f4ed31b3d30f1e3bffeb5a9678')
  const witness = run(launcher, ['--witness', root], { timeout: 170000 })
  await ready(join(root, 'witness-ready.json'))
  try {
    const sharedRoot = join(root, 'shared-desktop')
    await mkdir(sharedRoot)
    await diagnose(sharedRoot)
    const privateRoot = join(root, 'private-station')
    await mkdir(privateRoot)
    const result = await run(launcher, [privateRoot, process.execPath, fileURLToPath(import.meta.url), appRoot], { timeout: 155000 })
    await writeFile(join(root, 'private-owner-call.json'), jsonText(result))
    const receipt = await json(join(privateRoot, 'isolation-receipt.json'))
    const closed = await run(launcher, ['--verify-closed', receipt.stationName, join(root, 'station-closed.json')])
    await writeFile(join(root, 'station-closed-call.json'), jsonText(closed))
    assert.equal(result.exitCode, 0)
    assert.equal(closed.exitCode, 0)
    const permission = await run(binaryPath(), ['invoke', 'app.probePermissions', '--no-overlay', '--json', '--store-root', join(root, 'permission-store')], { env: { ...process.env, AUV_ENDPOINT: undefined, AUV_CONTEXT: undefined } })
    await writeFile(join(root, 'public-permission-probe.json'), jsonText(permission))
  }
  finally {
    await writeFile(join(root, 'witness-stop'), 'stop')
    const ended = await witness
    await writeFile(join(root, 'witness-call.json'), jsonText(ended))
    assert.equal(ended.exitCode, 0)
  }
  console.info(jsonText({ diagnosisComplete: true, inputCommandsRequested: 0, nativeInputAdmission: 'NOT_GRANTED', evidence: root }))
}

try {
  if (worker)
    await diagnose(root)
  else await outer()
}
catch (error) {
  await writeFile(join(root, worker ? 'worker-error.json' : 'diagnosis-error.json'), jsonText({ error: String(error), stack: error.stack }))
  process.exitCode = 1
}
