import type { ChildProcess } from 'node:child_process'

import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PendingActionManager } from './action-manager'
import { createComputerUseRuntime } from './runtime'

const external = vi.hoisted(() => ({
  onChild: vi.fn<(child: ChildProcess) => void>(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  type ExecFileWithCustom = typeof actual.execFile & { [promisify.custom]: (...args: unknown[]) => unknown }
  const origCustom = (actual.execFile as ExecFileWithCustom)[promisify.custom]
  const wrappedCustom = function (this: unknown, ...args: Parameters<typeof origCustom>) {
    const pending = (origCustom as any).apply(this, args)
    if (pending && pending.child) {
      external.onChild(pending.child)
    }
    return pending
  }
  const wrappedExecFile = Object.assign(
    function (this: unknown, ...args: Parameters<typeof actual.execFile>) {
      return (actual.execFile as any).apply(this, args)
    },
    { [promisify.custom]: wrappedCustom },
  )
  return {
    ...actual,
    execFile: wrappedExecFile,
  }
})

vi.mock('@auv-js/sdk/node', () => ({
  startAuv: vi.fn().mockResolvedValue({
    connectionOptions: { credential: 'test-token' },
    endpoints: ['ipc://test-auv'],
    exited: new Promise(() => {}),
    stop: vi.fn(),
  }),
}))

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn() } }))

// Compile mock_auv.cs on demand via Windows standard csc.exe into a temporary directory
async function resolveOrCompileMockAuv(tempDir: string): Promise<string> {
  if (process.env.MOCK_AUV_BINARY && existsSync(process.env.MOCK_AUV_BINARY))
    return process.env.MOCK_AUV_BINARY

  const cscCandidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ]
  const cscPath = cscCandidates.find(p => existsSync(p))
  if (!cscPath)
    throw new Error(`Cannot compile mock_auv.cs: csc.exe not found in standard paths: ${cscCandidates.join(', ')}`)

  const sourceCandidates = [
    resolve(__dirname, 'fixtures/mock_auv.cs'),
    resolve(process.cwd(), 'apps/stage-tamagotchi/src/main/services/airi/computer-use/fixtures/mock_auv.cs'),
  ]
  const sourcePath = sourceCandidates.find(p => existsSync(p))
  if (!sourcePath)
    throw new Error(`Cannot find mock_auv.cs in candidate paths: ${sourceCandidates.join(', ')}`)

  const targetBinary = join(tempDir, 'mock_auv.exe')
  const { execFile: realExecFile } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  const realExecFileAsync = promisify(realExecFile)

  await realExecFileAsync(cscPath, ['/nologo', `/out:${targetBinary}`, sourcePath], { windowsHide: true })
  if (!existsSync(targetBinary))
    throw new Error(`Compilation succeeded but binary not found at ${targetBinary}`)

  return targetBinary
}

describe('issue-2 real native child process timeline and queue behavior', () => {
  let directory: string
  let storeRoot: string
  let actionManager: PendingActionManager

  beforeEach(async () => {
    vi.clearAllMocks()
    directory = await mkdtemp(join(tmpdir(), 'airi-issue2-real-'))
    storeRoot = join(directory, 'store')
    await mkdir(storeRoot)
    actionManager = new PendingActionManager()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // --------------------------------------------------------------------------
  // Counterexample: In real Node child processes, descendant handle inheritance
  // prevents 'close' event from firing after direct child 'exit', hanging settlement.
  // --------------------------------------------------------------------------
  it('demonstrates deterministic counterexample: inherited stdio prevents child close event and hangs settlement without bounded stdio destruction', async () => {
    const childScriptPath = join(directory, 'counterexample_child.cjs')
    const childScript = [
      'const { spawn } = require("child_process");',
      'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, windowsHide: true, stdio: ["ignore", 1, 2] });',
      'console.log(JSON.stringify({ ok: true, grandchildPid: grandchild.pid }));',
      'process.exit(0);',
    ].join('\n')

    await writeFile(childScriptPath, childScript, 'utf8')

    const start = Date.now()
    let childExitTime = 0
    let childCloseTime = 0
    let grandchildPid = 0
    let settlementCompleted = false

    const { execFile: realExecFile } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    const realExecFileAsync = promisify(realExecFile)

    const pending = realExecFileAsync(process.execPath, [childScriptPath], { windowsHide: true })
    const child = pending.child

    child.on('exit', (code) => {
      childExitTime = Date.now() - start
      console.info(`[COUNTEREXAMPLE TIMELINE] Direct child exit at ${childExitTime}ms (exitCode: ${code})`)
    })

    child.on('close', (code) => {
      childCloseTime = Date.now() - start
      console.info(`[COUNTEREXAMPLE TIMELINE] Child close event at ${childCloseTime}ms (code: ${code})`)
    })

    const settlementPromise = pending.then(
      (res) => {
        settlementCompleted = true
        const data = JSON.parse(res.stdout)
        grandchildPid = data.grandchildPid
        return res
      },
      (err) => {
        settlementCompleted = true
        throw err
      },
    )

    try {
      // Wait 1200ms: direct child has already exited, but close has NOT arrived because grandchild holds stdio handles
      await new Promise(r => setTimeout(r, 1200))

      expect(childExitTime).toBeGreaterThan(0)
      expect(childExitTime).toBeLessThan(600)
      expect(childCloseTime).toBe(0) // Close event is MISSING / delayed indefinitely
      expect(settlementCompleted).toBe(false) // Settlement is FROZEN

      // Now trigger the bounded drainage strategy: destroy parent pipe streams
      console.info('[COUNTEREXAMPLE RECOVERY] Destroying stdout/stderr pipe handles to release hang...')
      child.stdout?.destroy()
      child.stderr?.destroy()

      await settlementPromise
      expect(settlementCompleted).toBe(true)
      expect(childCloseTime).toBeGreaterThanOrEqual(1200)

      let grandchildAlive = false
      if (grandchildPid > 0) {
        try {
          process.kill(grandchildPid, 0)
          grandchildAlive = true
        }
        catch {}
      }

      console.info('[COUNTEREXAMPLE EVIDENCE]', JSON.stringify({
        case: 'Deterministic Node.js Counterexample',
        childExitTime,
        childCloseTimeWithoutDrain: 'would hang indefinitely',
        childCloseTimeAfterDrain: childCloseTime,
        grandchildPid,
        grandchildAliveAtDrain: grandchildAlive,
      }))

      expect(grandchildAlive).toBe(true)
    }
    finally {
      if (grandchildPid > 0) {
        try {
          process.kill(grandchildPid)
        }
        catch {}
      }
    }
  }, 15000)

  // --------------------------------------------------------------------------
  // Full Runtime Integration Test with Real Native Process (mock_auv.exe)
  // Guarded to win32 only: requires Windows native process and C# compiler.
  // --------------------------------------------------------------------------
  describe.runIf(process.platform === 'win32')('real native child process execution with mock_auv', () => {
    let binaryPath: string
    let fixtureTempDir: string

    beforeAll(async () => {
      fixtureTempDir = await mkdtemp(join(tmpdir(), 'airi-mock-auv-'))
      binaryPath = await resolveOrCompileMockAuv(fixtureTempDir)
    })

    afterAll(async () => {
      if (fixtureTempDir) {
        await rm(fixtureTempDir, { recursive: true, force: true }).catch(() => {})
      }
    })

    it('measures real native timeline: child exit vs child close vs queue admission', async () => {
      process.env.MOCK_AUV_MODE = 'leak_stdio'

      const startTime = Date.now()
      console.info('[ISSUE-2 EXPERIMENT START] Time: 0ms')

      let op1ChildExitTime = 0
      let op1ChildCloseTime = 0
      let op2ChildExitTime = 0
      let op2ChildCloseTime = 0
      let callIndex = 0

      external.onChild.mockImplementation((child) => {
        const idx = ++callIndex
        child.on('exit', (code, signal) => {
          const exitTime = Date.now() - startTime
          if (idx === 1)
            op1ChildExitTime = exitTime
          else
            op2ChildExitTime = exitTime
          console.info(`[TIMELINE] Child #${idx} exit event at ${exitTime}ms (exitCode: ${code}, signal: ${signal})`)
        })
        child.on('close', (code, signal) => {
          const closeTime = Date.now() - startTime
          if (idx === 1)
            op1ChildCloseTime = closeTime
          else
            op2ChildCloseTime = closeTime
          console.info(`[TIMELINE] Child #${idx} close event at ${closeTime}ms (exitCode: ${code}, signal: ${signal})`)
        })
      })

      const runtime = createComputerUseRuntime({
        binaryPath,
        storeRoot,
        actionManager,
        requireAttribution: false,
      })

      let op1SettledTime = 0
      let op2StartTime = 0
      let op2SettledTime = 0
      let grandchildPid: number | undefined

      const action = actionManager.createPendingAction({
        argv: ['invoke', 'app.activate', 'Calculator'],
        attribution: {
          sessionId: 'session-1',
          turnId: 'turn-1',
          toolCallId: 'call-1',
          senderWebContentsId: 1,
        },
      })
      actionManager.approve(action.id)

      // Operation 1: Mutating operation that triggers descendant handle leak
      const op1Promise = runtime.run({
        argv: ['invoke', 'app.activate', 'Calculator'],
        actionId: action.id,
        attribution: action.attribution,
      }, 1).then(
        (res) => {
          op1SettledTime = Date.now() - startTime
          grandchildPid = (res.output as Record<string, unknown>)?.grandchildPid as number | undefined
          console.info(`[EVENT] Op1 resolved at ${op1SettledTime}ms:`, res)
          return res
        },
        (err) => {
          op1SettledTime = Date.now() - startTime
          console.info(`[EVENT] Op1 rejected at ${op1SettledTime}ms:`, err.message)
          throw err
        },
      )

      // Enqueue Operation 2: Arrives at 500ms (after direct child has exited, but while grandchild still holds stdio)
      await new Promise(r => setTimeout(r, 500))
      console.info(`[STATE at 500ms] Direct child has already exited (${op1ChildExitTime}ms). Op1 settlement status: ${op1SettledTime > 0 ? 'settled' : 'pending'}`)

      const op2Promise = (async () => {
        op2StartTime = Date.now() - startTime
        console.info(`[QUEUE] Enqueueing Op2 at ${op2StartTime}ms...`)
        const res = await runtime.run({
          argv: ['invoke', 'window.list'],
        })
        op2SettledTime = Date.now() - startTime
        console.info(`[EVENT] Op2 resolved at ${op2SettledTime}ms`)
        return res
      })()

      await Promise.all([op1Promise, op2Promise])

      const totalDuration = Date.now() - startTime
      console.info(`[ISSUE-2 EXPERIMENT END] Total duration: ${totalDuration}ms. op1SettledTime: ${op1SettledTime}ms, op2SettledTime: ${op2SettledTime}ms`)

      // Verify timeline measurements:
      expect(op1ChildExitTime).toBeGreaterThan(0)
      expect(op1ChildExitTime).toBeLessThan(op1SettledTime) // Exit happened before settlement
      expect(op1ChildCloseTime).toBeGreaterThanOrEqual(op1ChildExitTime) // Close happened on or after exit
      expect(op1SettledTime).toBeLessThan(2500) // Bounded cleanup unblocked op1!
      expect(op2SettledTime).toBeGreaterThanOrEqual(op1SettledTime)
      expect(op2ChildExitTime).toBeGreaterThanOrEqual(op1SettledTime) // Op2 ran strictly after Op1 settled!

      // Verify descendant alive status at settlement:
      let grandchildAlive = false
      if (typeof grandchildPid === 'number') {
        try {
          process.kill(grandchildPid, 0)
          grandchildAlive = true
        }
        catch {}
        // Clean up background descendant
        try {
          process.kill(grandchildPid)
        }
        catch {}
      }

      console.info('[ISSUE-2 MEASUREMENTS]', JSON.stringify({
        case: 'Issue-2 Native Child Process Timeline',
        op1ChildExitTime,
        op1ChildCloseTime,
        op1SettledTime,
        op2ChildExitTime,
        op2ChildCloseTime,
        op2SettledTime,
        grandchildPid,
        grandchildAliveAtOp1Settlement: grandchildAlive,
      }))

      expect(grandchildAlive).toBe(true)

      // Now test that a subsequent MUTATING operation is safely rejected due to lingering descendant risk
      const action2 = actionManager.createPendingAction({
        argv: ['invoke', 'app.activate', 'Terminal'],
        attribution: {
          sessionId: 'session-1',
          turnId: 'turn-2',
          toolCallId: 'call-2',
          senderWebContentsId: 1,
        },
      })
      actionManager.approve(action2.id)

      await expect(runtime.run({
        argv: ['invoke', 'app.activate', 'Terminal'],
        actionId: action2.id,
        attribution: action2.attribution,
      }, 1)).rejects.toThrow(/unconfirmed background processes/)

      await runtime.dispose()
      delete process.env.MOCK_AUV_MODE
    }, 15000)
  })
})
