import assert from 'node:assert/strict'
import process from 'node:process'

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// This checks raw receiver records. It does not run an input executor.
const root = process.argv[2]
assert.ok(root, 'Pass the executor evidence directory.')
const json = async file => JSON.parse((await readFile(join(root, file), 'utf8')).replace(/^\uFEFF/, ''))
const commands = await json('commands.json')
const cases = await json('cases.json')
const initial = await json('initial-oracle.json')
const summary = await json('worker-summary.json')
const witness = await json('interactive-witness.json')
const station = await json('station-closed.json')
const cleanup = await json('worker-cleanup.json')
const transport = await json('transport-barrier.json')
const daemon = await json('daemon-readonly.json')

assert.equal(initial.isolation.stationVisible, false)
assert.equal(initial.isolation.canOpenInputDesktop, false)
assert.equal(initial.isolation.desktop, 'Harness')
assert.ok(initial.isolation.station.startsWith('airi-phase3b2a-'))
assert.notEqual(initial.initialA.pid, initial.initialB.pid)
assert.notEqual(initial.initialA.instance, initial.initialB.instance)
assert.equal(initial.initialA.windows[0].root.pid, initial.initialA.pid)
assert.equal(initial.initialB.windows[0].root.pid, initial.initialB.pid)

const attachmentError = 'input desktop attachment failed: Failed to open input desktop'
assert.equal(commands.length, 20)
for (const command of commands) {
  assert.equal(command.exitCode, 1)
  assert.equal(command.timedOut, false)
  assert.equal(command.output.status, 'failed')
  assert.equal(command.output.result, null)
  assert.deepEqual(JSON.parse(command.stdout), command.output)
  const message = command.output.failure
  if (/targeted-(?:text|shortcut)-app-/.test(command.name)) {
    assert.match(message, /0 complete actions and 0 presses: Windows targeted keyboard input is not supported/)
  }
  else {
    assert.equal(message, attachmentError)
  }
  if (command.args[1] !== 'window.list')
    assert.ok(command.args.includes('--target'))
  if (command.args[1] === 'input.clickPoint') {
    assert.equal(command.args[command.args.indexOf('--input-policy') + 1], 'background-only')
    assert.equal(command.args[command.args.indexOf('--relative-to') + 1], 'window')
  }
}

function zeroCounts(counts) {
  for (const count of Object.values(counts)) assert.equal(count, 0)
}

let oracleRecords = 0
for (const directory of (await readdir(root)).filter(name => /^target-[ab]-\d+$/.test(name))) {
  const lines = (await readFile(join(root, directory, 'oracle.jsonl'), 'utf8')).trim().split(/\r?\n/)
  assert.ok(lines.length > 1)
  for (const line of lines) {
    const record = JSON.parse(line)
    oracleRecords++
    assert.equal(record.station, initial.isolation.station)
    assert.equal(record.desktop, 'Harness')
    assert.equal(record.pauseTimedOut, false)
    for (const window of record.windows) {
      const state = window.business
      assert.equal(state.result, '')
      assert.equal(state.commitCount, 0)
      assert.equal(state.rootMouseMessages, 0)
      assert.equal(state.rootKeyMessages, 0)
      zeroCounts(state.button)
      zeroCounts(state.decoy)
      state.retiredButtons.forEach(zeroCounts)
      assert.equal(state.editor.text, '')
      assert.equal(state.editor.textChanges, 0)
      assert.equal(state.editor.keys, 0)
      assert.equal(state.editor.mouseMessages, 0)
    }
  }
}

assert.equal(cases.length, 21)
for (const sample of cases) assert.equal(sample.nativeDeliveryVerified, false)
const sample = name => cases.find(item => item.name === name)
const last = record => record.windows.at(-1)
const displaced = last(sample('stale-point-wrong-control').swapped)
assert.equal(displaced.originalPointCurrentHit, displaced.decoy.hwnd)
const child = sample('same-root-replaced-child')
assert.equal(last(child.beforeA).root.hwnd, last(child.childReplacement).root.hwnd)
assert.equal(last(child.childReplacement).childGeneration, last(child.beforeA).childGeneration + 1)
assert.equal(last(sample('closed-root').afterA).live, false)
const recreated = sample('same-process-recreated-root')
assert.equal(recreated.replacement.pid, recreated.beforeA.pid)
assert.notEqual(last(recreated.replacement).windowInstance, last(recreated.beforeA).windowInstance)
const processReplacement = sample('different-process-recreated-root')
assert.notEqual(processReplacement.priorProcess.pid, processReplacement.afterA.pid)
for (const after of ['none', 'close', 'replace-child']) {
  const delayed = sample(`receiver-delay-${after}`)
  assert.equal(delayed.paused.paused, true)
  assert.equal(delayed.beforeRelease.paused, true)
  assert.equal(delayed.afterA.paused, false)
}

assert.ok(transport.receivedBytes > 0)
assert.equal(transport.forwardedBytes, 0)
assert.equal(transport.timedOut, false)
assert.equal(transport.signal, 'SIGTERM')
assert.match(daemon.calls.find(call => call.name === 'runner-window-list').error, /input desktop attachment failed/)
assert.match(daemon.calls.find(call => call.name === 'runner-window-list-pre-canceled').error, /operation was aborted/)
assert.equal(daemon.calls.find(call => call.name === 'health').result.status, 'serving')
for (const probe of sample('independent-uia-capability').probes) {
  assert.equal(probe.result.timedOut, false)
  assert.equal(probe.receipt.executor, 'independent UIAutomation client, not AUV')
  if (probe.receipt.operation !== 'read') {
    assert.equal(probe.receipt.completed, false)
    assert.match(probe.receipt.error, /Requested semantic fixture control is absent/)
  }
}

assert.equal(witness.identity.station, 'WinSta0')
assert.equal(witness.events.length, 0)
assert.deepEqual(witness.after, witness.before)
assert.equal(station.exists, false)
assert.equal(station.error, 2)
assert.equal(cleanup.length, 3)
for (const fixture of cleanup) assert.equal(fixture.exitCode, 0)
assert.equal(summary.nativeWriteAdmission, 'NO-GO')
assert.equal(summary.globalKeyboardExecuted, false)
assert.equal(summary.inputDesktopSwitched, false)
console.info(JSON.stringify({ verified: true, commands: commands.length, cases: cases.length, oracleRecords, measuredReceiverInput: 0, successfulNativeDeliveryProven: false, nativeWriteAdmission: 'NO-GO' }))
