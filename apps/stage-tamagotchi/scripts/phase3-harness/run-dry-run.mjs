import assert from 'node:assert/strict'
import process from 'node:process'

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { binaryPath } from '@auv-js/cli/binary'
import { startAuv } from '@auv-js/sdk/node'

/**
 * Runs native observation and CLI planning. Every candidate call requires --dry-run.
 *
 * Call stack:
 * run-dry-run
 *   -> isolated Win32 fixtures -> independent oracle.jsonl
 *   -> private AUV daemon -> CLI --dry-run -> plan only
 *   -> compare plans with fixture state -> oracle-verdict.json
 */
const output = resolve(process.argv[2] ?? '')
const scriptRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptRoot, '../../../..')
assert.equal(process.platform, 'win32')
assert.ok(process.argv[2] && isAbsolute(process.argv[2]), 'An absolute evidence directory is required.')
const relativeOutput = relative(repoRoot, output)
assert.ok(relativeOutput === '..' || relativeOutput.startsWith(`..${sep}`) || isAbsolute(relativeOutput), 'Evidence must stay outside the repository.')
await mkdir(output, { recursive: true })
assert.equal((await readdir(output)).length, 0, 'Use an empty evidence directory. Existing receipts must not satisfy a new run.')
const children = []
const plans = []
const states = []
let daemon
let sequence = 0

async function execute(file, args, credential, environment = process.env) {
  const child = spawn(file, args, { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', text => stdout += text)
  child.stderr.setEncoding('utf8').on('data', text => stderr += text)
  child.stdin.on('error', () => {})
  child.stdin.end(credential ? `${credential}\n` : undefined)
  const timer = setTimeout(() => child.kill(), 30000)
  try {
    return await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', exitCode => resolve({ exitCode, stdout, stderr }))
    })
  }
  finally {
    clearTimeout(timer)
  }
}

async function state(label, expectedSequence = 0) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(await readFile(join(output, label, 'state.json'), 'utf8'))
      if (value.sequence >= expectedSequence)
        return value
    }
    catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error
    }
    const failure = await readFile(join(output, label, 'error.txt'), 'utf8').catch(() => undefined)
    assert.equal(failure, undefined, failure)
    await delay(25)
  }
  throw new Error(`Fixture ${label} did not acknowledge sequence ${expectedSequence}.`)
}

async function request(label, command) {
  sequence++
  await writeFile(join(output, label, 'request.json'), JSON.stringify({ sequence, command }))
  const snapshot = await state(label, sequence)
  states.push({ label, command, snapshot })
  return snapshot
}

async function plan(name, window, point = window.buttonPoint) {
  const argv = ['invoke', 'input.clickPoint', String(point.x), String(point.y), '--target', `window:${window.root.hwnd}`, '--relative-to', 'window', '--input-policy', 'background-only', '--click-count', '1', '--dry-run', '--no-overlay', '--json', '--store-root', join(output, 'auv-store')]
  // The runner has no live-input branch. Extra callers cannot remove this check.
  assert.ok(argv.includes('--dry-run'))
  const result = await execute(binaryPath(), ['--credential-stdin', ...argv], daemon.connectionOptions.credential, {
    ...process.env,
    AUV_ENDPOINT: daemon.endpoints[0],
    AUV_CONTEXT: undefined,
  })
  const record = { name, argv, ...result }
  plans.push(record)
  await writeFile(join(output, 'plans.json'), `${JSON.stringify(plans, null, 2)}\n`)
  return record
}

try {
  const compiler = join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  const executable = join(output, 'native-harness.exe')
  const compilation = await execute(compiler, ['/nologo', '/target:winexe', `/out:${executable}`, '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll', join(scriptRoot, 'native-harness.cs')])
  await writeFile(join(output, 'compile.json'), `${JSON.stringify(compilation, null, 2)}\n`)
  assert.equal(compilation.exitCode, 0, compilation.stdout + compilation.stderr)
  await writeFile(join(output, 'harness-identity.json'), `${JSON.stringify({
    sourceSha256: createHash('sha256').update(await readFile(join(scriptRoot, 'native-harness.cs'))).digest('hex'),
    binarySha256: createHash('sha256').update(await readFile(executable)).digest('hex'),
    binaryBytes: (await stat(executable)).size,
    compiler,
  }, null, 2)}\n`)
  for (const label of ['target-a', 'target-b']) {
    await mkdir(join(output, label), { recursive: true })
    const child = spawn(executable, [join(output, label), label], { windowsHide: true, stdio: 'ignore' })
    children.push({ label, child, exited: new Promise(resolve => child.once('exit', code => resolve(code))) })
    await state(label)
  }
  const initialA = await request('target-a', 'snapshot')
  const initialB = await request('target-b', 'snapshot')
  assert.notEqual(initialA.pid, initialB.pid)
  assert.notEqual(initialA.instance, initialB.instance)
  const original = initialA.windows[0]
  daemon = await startAuv({ binaryPath: binaryPath(), noRegister: true, overlay: false, storeRoot: join(output, 'auv-store') })
  await writeFile(join(output, 'daemon-identity.json'), JSON.stringify({ pid: daemon.pid, endpoints: daemon.endpoints, private: true }))
  const initial = await plan('initial', original)
  assert.equal(initial.exitCode, 0, initial.stdout + initial.stderr)
  const swapped = await request('target-a', 'swap-controls')
  const stalePoint = await plan('stale-point-after-control-swap', original)
  assert.equal(stalePoint.exitCode, 0)
  assert.equal(swapped.windows[0].originalPointCurrentHit, original.decoy.hwnd)
  await request('target-a', 'restore-controls')
  const shrunk = await request('target-a', 'shrink')
  const outside = await plan('point-outside-shrunk-window', original)
  assert.notEqual(outside.exitCode, 0)
  await request('target-a', 'restore-size')
  const moved = await request('target-a', 'move')
  const movedPlan = await plan('window-moved', original)
  assert.equal(movedPlan.exitCode, 0)
  const replaced = await request('target-a', 'replace')
  const oldTarget = await plan('old-hwnd-after-replacement', original)
  const replacement = replaced.windows.at(-1)
  assert.ok(replacement.live)
  assert.notEqual(replacement.root.hwnd, '0')
  assert.equal(replacement.root.pid, initialA.pid)
  const closed = await request('target-a', 'close')
  const gone = await plan('closed-target', replacement)
  assert.notEqual(gone.exitCode, 0)
  const finalB = await request('target-b', 'snapshot')
  const ownHandles = new Set(states.flatMap(({ snapshot }) => snapshot.windows.map(window => window.root.hwnd)))
  const businessUnchanged = snapshot => snapshot.windows.every(window => window.business.commitCount === 0
    && window.business.result === ''
    && window.business.button.mouseMessages === 0 && window.business.decoy.mouseMessages === 0
    && window.business.button.mouseDown === 0 && window.business.button.mouseUp === 0
    && window.business.button.keys === 0 && window.business.button.clickEvents === 0
    && window.business.decoy.mouseDown === 0 && window.business.decoy.mouseUp === 0
    && window.business.decoy.keys === 0 && window.business.decoy.clickEvents === 0
    && window.business.rootMouseMessages === 0 && window.business.rootKeyMessages === 0)
  const verdict = {
    evidenceLevel: 'real Win32 fixtures and installed AUV dry-run only. No native input delivery.',
    initialA,
    initialB,
    swapped,
    shrunk,
    moved,
    replaced,
    closed,
    finalB,
    noInputMessagesOrBusinessMutations: states.every(item => businessUnchanged(item.snapshot)),
    targetBStateUnchanged: JSON.stringify(initialB.windows) === JSON.stringify(finalB.windows),
    foregroundStable: states.every(({ snapshot }) => snapshot.foreground === initialA.initialForeground && snapshot.foregroundEvents.length === 0),
    fixtureNeverForeground: states.every(({ snapshot }) => !ownHandles.has(snapshot.foreground)
      && snapshot.foregroundEvents.every(event => !ownHandles.has(event.hwnd))),
    stalePointPlanAcceptedWhileDecoyOccupiesPoint: stalePoint.exitCode === 0 && swapped.windows[0].originalPointCurrentHit === original.decoy.hwnd,
    replacementReusedActualHandle: original.root.hwnd === replacement.root.hwnd,
    oldHandlePlanExitCode: oldTarget.exitCode,
    closedTargetPlanExitCode: gone.exitCode,
    verdict: 'NO-GO',
    reason: 'Dry-run omits child hit testing and posting. No approval-time target identity reaches the stock delivery boundary.',
  }
  await writeFile(join(output, 'oracle-verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`)
  assert.ok(verdict.noInputMessagesOrBusinessMutations)
  assert.ok(verdict.targetBStateUnchanged)
  console.info(JSON.stringify({ verdict: verdict.verdict, plans: plans.length, zeroInput: verdict.noInputMessagesOrBusinessMutations, targetBUnchanged: verdict.targetBStateUnchanged, foregroundStable: verdict.foregroundStable, actualHandleReused: verdict.replacementReusedActualHandle }))
}
finally {
  await daemon?.stop()
  for (const item of children) {
    if (item.child.exitCode === null) {
      await request(item.label, 'stop').catch(() => {})
      const completed = await Promise.race([item.exited.then(() => true), delay(3000).then(() => false)])
      if (!completed)
        item.child.kill()
    }
  }
  await writeFile(join(output, 'states.json'), `${JSON.stringify(states, null, 2)}\n`)
  await writeFile(join(output, 'cleanup.json'), `${JSON.stringify(children.map(({ label, child }) => ({ label, pid: child.pid, exitCode: child.exitCode })), null, 2)}\n`)
}
