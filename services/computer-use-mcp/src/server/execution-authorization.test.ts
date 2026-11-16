import type { ComputerUseConfig, DesktopExecutor, TerminalRunner } from '../types'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CdpBridge } from '../browser-dom/cdp-bridge'
import { createComputerUseMcpServer } from '../server'
import { createPtySession, getPtyAvailabilityInfo } from '../terminal/pty-runner'
import { createDisplayInfo, createLocalExecutionTarget, createPermissionInfo, createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'
import { runBrowserAgentTask } from './browser-agent'
import { createAcquirePtyCallback } from './register-pty'
import { resolvePendingAction } from './register-tools'

vi.mock('../terminal/pty-runner', () => ({
  createPtySession: vi.fn().mockRejectedValue(new Error('Native PTY is disabled in this audit.')),
  destroyAllPtySessions: vi.fn(),
  destroyPtySession: vi.fn(),
  getPtyAvailabilityInfo: vi.fn().mockResolvedValue({ available: false, reason: 'Audit uses mock executors.' }),
  isPtyAvailable: vi.fn().mockResolvedValue(false),
  listPtySessions: vi.fn().mockResolvedValue([]),
  readPtyScreen: vi.fn(),
  resizePty: vi.fn(),
  writeToPty: vi.fn(),
}))

vi.mock('./browser-agent', () => ({
  getBrowserAgentLaunchContext: vi.fn().mockReturnValue({ rootExists: true, cliCwd: 'fixture-root', cliModule: 'fixture_module', pythonCommand: 'fixture-python', cdpUrl: 'http://127.0.0.1:1' }),
  runBrowserAgentTask: vi.fn().mockResolvedValue({ success: true, instruction: 'fixture', agent: 'google', cdpUrl: 'http://127.0.0.1:1', cliCwd: 'fixture-root', cliModule: 'fixture_module', pythonCommand: 'fixture-python', exitCode: 0, timedOut: false, stderrLines: [] }),
}))

const cleanupTasks: Array<() => Promise<void>> = []

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPtyAvailabilityInfo).mockResolvedValue({ available: false, error: 'Audit uses mock executors.' })
})

afterEach(async () => {
  for (const cleanup of cleanupTasks.splice(0).reverse())
    await cleanup()
  vi.restoreAllMocks()
})

async function createHarness(approvalMode: ComputerUseConfig['approvalMode'], executor: ComputerUseConfig['executor'] = 'dry-run') {
  const root = await mkdtemp(join(tmpdir(), 'airi-auth-boundary-'))
  cleanupTasks.push(async () => {
    expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    await rm(root, { recursive: true, force: true })
  })
  const config = createTestConfig({
    sessionRoot: root,
    auditLogPath: join(root, 'audit.jsonl'),
    screenshotsDir: join(root, 'screenshots'),
    executor,
    approvalMode,
    defaultCaptureAfter: false,
    requireSessionTagForMutatingActions: false,
    requireAllowedBoundsForMutatingActions: false,
    requireCoordinateAlignmentForMutatingActions: false,
    remoteSshHost: '192.0.2.1',
    denyApps: [],
    denyWindowTitles: [],
    browserDomBridge: { enabled: false, host: '127.0.0.1', port: 0, requestTimeoutMs: 1000 },
  })
  const result = { performed: false, backend: 'dry-run' as const, notes: ['Mock executor.'] }
  const desktop = {
    kind: 'dry-run',
    describe: () => ({ kind: 'dry-run', notes: ['Mock executor.'] }),
    getExecutionTarget: vi.fn().mockResolvedValue(createLocalExecutionTarget({ hostName: 'fixture-host' })),
    getForegroundContext: vi.fn().mockResolvedValue({ available: true, appName: 'Terminal', windowTitle: 'Fixture', platform: 'win32' }),
    getDisplayInfo: vi.fn().mockResolvedValue(createDisplayInfo({ platform: 'win32' })),
    getPermissionInfo: vi.fn().mockResolvedValue(createPermissionInfo()),
    observeWindows: vi.fn().mockResolvedValue({ windows: [], observedAt: new Date().toISOString() }),
    takeScreenshot: vi.fn().mockRejectedValue(new Error('No real captures in the audit.')),
    openApp: vi.fn().mockResolvedValue(result),
    focusApp: vi.fn().mockResolvedValue(result),
    click: vi.fn().mockResolvedValue(result),
    typeText: vi.fn().mockResolvedValue(result),
    pressKeys: vi.fn().mockResolvedValue(result),
    scroll: vi.fn().mockResolvedValue(result),
    wait: vi.fn().mockResolvedValue(result),
  } satisfies DesktopExecutor
  const terminal = {
    describe: () => ({ kind: 'local-shell-runner', notes: ['Mock terminal.'] }),
    execute: vi.fn<TerminalRunner['execute']>().mockImplementation(async input => ({ command: input.command, stdout: 'mock output', stderr: '', exitCode: 0, effectiveCwd: root, durationMs: 0, timedOut: false })),
    getState: () => ({ effectiveCwd: root }),
    resetState: () => ({ effectiveCwd: root }),
  } satisfies TerminalRunner
  const { server, runtime } = await createComputerUseMcpServer(config, {
    executorFactory: () => desktop,
    terminalRunnerFactory: () => terminal,
  })
  if (executor === 'auv') {
    desktop.getExecutionTarget.mockResolvedValue(createLocalExecutionTarget({ hostName: 'fixture-host' }))
    desktop.getForegroundContext.mockResolvedValue({
      available: true,
      appName: 'Fixture App',
      windowTitle: 'Fixture Window',
      windowId: 'fixture-window',
      ownerPid: 4242,
      platform: 'win32',
    })
    desktop.getDisplayInfo.mockResolvedValue(createDisplayInfo({
      platform: 'win32',
      displays: [{
        displayId: 1,
        isMain: true,
        isBuiltIn: false,
        bounds: { x: 0, y: 0, width: 1280, height: 720 },
        visibleBounds: { x: 0, y: 0, width: 1280, height: 720 },
        scaleFactor: 1,
        pixelWidth: 1280,
        pixelHeight: 720,
      }],
      combinedBounds: { x: 0, y: 0, width: 1280, height: 720 },
    }))
    runtime.session.setLastScreenshot({
      dataBase64: 'fixture',
      mimeType: 'image/png',
      path: join(root, 'fixture.png'),
      capturedAt: new Date().toISOString(),
      placeholder: false,
      width: 1280,
      height: 720,
      executionTargetMode: 'local-windowed',
      sourceHostName: 'fixture-host',
      sourceDisplayId: '1',
      sourceWindowId: 'fixture-window',
      sourceSessionTag: config.sessionTag,
    })
  }
  vi.spyOn(runtime.cdpBridgeManager, 'probeAvailability').mockResolvedValue({ endpoint: 'http://127.0.0.1:1', connected: false, connectable: false })
  const bridge = new CdpBridge({ cdpUrl: 'http://127.0.0.1:1', requestTimeoutMs: 1000 })
  const evaluate = vi.spyOn(bridge, 'evaluate').mockResolvedValue('mock page effect')
  const navigate = vi.spyOn(bridge, 'navigate').mockResolvedValue(undefined)
  const ensureBridge = vi.spyOn(runtime.cdpBridgeManager, 'ensureBridge').mockResolvedValue(bridge)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'authorization-audit', version: '1.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  cleanupTasks.push(async () => {
    await client.close()
    await server.close()
    await runtime.browserDomBridge.close()
    await runtime.cdpBridgeManager.close()
  })
  return { client, runtime, desktop, terminal, evaluate, navigate, ensureBridge, root }
}

function auditResult(label: string, calls: number) {
  console.info(JSON.stringify({ audit: label, mockExecutorCalls: calls }))
}

for (const mode of ['actions', 'all'] as const) {
  describe(`MCP authorization boundary: ${mode}`, () => {
    it('denies AUV input when screenshot pixels do not align with live display geometry', async () => {
      const h = await createHarness(mode, 'auv')
      h.desktop.getDisplayInfo.mockResolvedValue(createDisplayInfo({
        platform: 'win32',
        displays: [{
          displayId: 1,
          isMain: true,
          isBuiltIn: false,
          bounds: { x: 0, y: 0, width: 2560, height: 1440 },
          visibleBounds: { x: 0, y: 0, width: 2560, height: 1440 },
          scaleFactor: 1,
          pixelWidth: 2560,
          pixelHeight: 1440,
        }],
        combinedBounds: { x: 0, y: 0, width: 2560, height: 1440 },
      }))

      const result = await h.client.callTool({ name: 'desktop_click', arguments: { x: 20, y: 20 } })

      expect(result.structuredContent).toMatchObject({ status: 'denied' })
      expect(JSON.stringify(result.structuredContent)).toContain('does not match logical display 2560x1440')
      expect(h.desktop.click).not.toHaveBeenCalled()
    })

    it('queues GUI AUV changes for Host approval and keeps Terminal approval independent', async () => {
      const h = await createHarness(mode, 'auv')
      const click = await h.client.callTool({ name: 'desktop_click', arguments: { x: 20, y: 20 } })
      const typeText = await h.client.callTool({ name: 'desktop_type_text', arguments: { text: 'fixture' } })
      const terminal = await h.client.callTool({ name: 'terminal_exec', arguments: { command: 'fixture-command', cwd: h.root } })
      expect(h.desktop.click).not.toHaveBeenCalled()
      expect(h.desktop.typeText).not.toHaveBeenCalled()
      expect(click.structuredContent).toMatchObject({ status: 'approval_required' })
      expect(typeText.structuredContent).toMatchObject({ status: 'approval_required' })
      expect(terminal.structuredContent).toMatchObject({ status: 'approval_required' })
      expect(h.terminal.execute).not.toHaveBeenCalled()
    })

    it('propagates Host or Turbo revocation into one in-flight AUV input', async () => {
      const h = await createHarness(mode, 'auv')
      const requested = await h.client.callTool({ name: 'desktop_click', arguments: { x: 20, y: 20 } })
      const pending = h.runtime.session.listPendingActions()[0]
      expect(requested.structuredContent).toMatchObject({ status: 'approval_required' })
      expect(pending).toBeDefined()

      let markStarted!: () => void
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      h.desktop.click.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
        markStarted()
        if (options?.signal?.aborted) {
          reject(options.signal.reason)
          return
        }
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      }))
      const controller = new AbortController()
      const executeAction = createExecuteAction(h.runtime)
      const running = resolvePendingAction({
        runtime: h.runtime,
        executeAction,
        id: pending!.id,
        decision: { type: 'approve', source: 'host-approval-window', signal: controller.signal },
      })

      await started
      expect(h.desktop.click).toHaveBeenCalledWith(
        expect.objectContaining({ x: 20, y: 20 }),
        expect.objectContaining({ signal: controller.signal, targetWindowId: 'fixture-window' }),
      )
      controller.abort(new Error('Turbo revoked'))
      await expect(running).resolves.toMatchObject({ isError: true })
      expect(h.desktop.click).toHaveBeenCalledOnce()
    })

    it('keeps the approved target window when the Host dialog changes foreground focus', async () => {
      const h = await createHarness(mode, 'auv')
      const requested = await h.client.callTool({ name: 'desktop_click', arguments: { x: 20, y: 20 } })
      const pending = h.runtime.session.listPendingActions()[0]
      expect(requested.structuredContent).toMatchObject({ status: 'approval_required' })
      expect(pending?.context).toMatchObject({ windowId: 'fixture-window', ownerPid: 4242 })

      h.desktop.getForegroundContext.mockResolvedValue({
        available: true,
        appName: 'AIRI approval window',
        windowId: 'approval-window',
        platform: 'win32',
      })
      const executeAction = createExecuteAction(h.runtime)
      const result = await resolvePendingAction({
        runtime: h.runtime,
        executeAction,
        id: pending!.id,
        decision: { type: 'approve', source: 'host-approval-window' },
      })

      expect(result.structuredContent).toMatchObject({ status: 'executed' })
      expect(h.desktop.click).toHaveBeenCalledWith(
        expect.objectContaining({ x: 20, y: 20 }),
        expect.objectContaining({
          targetWindowId: 'fixture-window',
          targetWindowContext: expect.objectContaining({ windowId: 'fixture-window', ownerPid: 4242 }),
        }),
      )
    })

    it('does not accept the requesting agent as its own approver', async () => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'terminal_exec', arguments: { command: 'fixture-command', cwd: h.root } })
      const pending = h.runtime.session.listPendingActions()[0]
      expect(pending).toBeDefined()
      const result = await h.client.callTool({ name: 'desktop_approve_pending_action', arguments: { id: pending.id } })
      auditResult(`self-approval-${mode}`, h.terminal.execute.mock.calls.length)
      expect(h.terminal.execute).not.toHaveBeenCalled()
      expect(result.isError).toBe(true)
    })

    it.each([undefined, true])('does not let workflow autoApprove=%s weaken server policy', async (autoApprove) => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'workflow_run_tests', arguments: { projectPath: h.root, testCommand: 'fixture-command', autoApprove } })
      auditResult(`workflow-auto-approval-${mode}`, h.terminal.execute.mock.calls.length)
      expect(h.terminal.execute).not.toHaveBeenCalled()
    })

    it('does not resume a rejected workflow step from an agent boolean', async () => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'workflow_run_tests', arguments: { projectPath: h.root, testCommand: 'fixture-command', autoApprove: false } })
      const pending = h.runtime.session.listPendingActions()[0]
      expect(pending).toBeDefined()
      await h.client.callTool({ name: 'desktop_reject_pending_action', arguments: { id: pending.id } })
      await h.client.callTool({ name: 'workflow_resume', arguments: { approved: true, autoApprove: true } })
      auditResult(`rejected-workflow-resume-${mode}`, h.terminal.execute.mock.calls.length)
      expect(h.terminal.execute).not.toHaveBeenCalled()
    })

    it('does not turn workflow cancellation into a later write', async () => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'workflow_run_tests', arguments: { projectPath: h.root, testCommand: 'fixture-command', autoApprove: false } })
      const pending = h.runtime.session.listPendingActions()[0]
      expect(pending).toBeDefined()
      await h.client.callTool({ name: 'workflow_resume', arguments: { approved: false } })
      await h.client.callTool({ name: 'desktop_approve_pending_action', arguments: { id: pending.id } })
      auditResult(`cancelled-workflow-approval-${mode}`, h.terminal.execute.mock.calls.length + h.desktop.openApp.mock.calls.length)
      expect(h.terminal.execute).not.toHaveBeenCalled()
      expect(h.desktop.openApp).not.toHaveBeenCalled()
    })

    it('queues available PTY acquisition without creating a native process', async () => {
      const h = await createHarness(mode)
      vi.mocked(getPtyAvailabilityInfo).mockResolvedValue({ available: true })
      const result = await createAcquirePtyCallback(h.runtime)({ taskId: 'fixture-task', stepId: 'fixture-step', cwd: h.root, autoApprove: false })
      expect(result).toMatchObject({ acquired: false, approvalPending: true })
      expect(createPtySession).not.toHaveBeenCalled()
      expect(h.runtime.session.listPendingActions()).toHaveLength(1)
    })

    it('denies a delegated browser backend while approval is required', async () => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'browser_agent_run', arguments: { instruction: 'fixture browser task' } })
      auditResult(`delegated-browser-${mode}`, vi.mocked(runBrowserAgentTask).mock.calls.length)
      expect(runBrowserAgentTask).not.toHaveBeenCalled()
    })

    it('denies unrestricted CDP evaluation and navigation before bridge access', async () => {
      const h = await createHarness(mode)
      await h.client.callTool({ name: 'browser_cdp_evaluate', arguments: { expression: 'document.body.dataset.audit = "fixture"' } })
      await h.client.callTool({ name: 'browser_cdp_navigate', arguments: { url: 'https://example.com/fixture' } })
      auditResult(`cdp-mutations-${mode}`, h.evaluate.mock.calls.length + h.navigate.mock.calls.length)
      expect(h.evaluate).not.toHaveBeenCalled()
      expect(h.navigate).not.toHaveBeenCalled()
      expect(h.ensureBridge).not.toHaveBeenCalled()
    })
  })
}

it('keeps never as an explicit trusted startup choice', async () => {
  const h = await createHarness('never')
  await h.client.callTool({ name: 'terminal_exec', arguments: { command: 'fixture-command', cwd: h.root } })
  expect(h.terminal.execute).toHaveBeenCalledTimes(1)
})

it('keeps never-mode browser mutation permission explicit', async () => {
  const h = await createHarness('never')
  await h.client.callTool({ name: 'browser_cdp_evaluate', arguments: { expression: 'fixture expression' } })
  await h.client.callTool({ name: 'browser_cdp_navigate', arguments: { url: 'https://example.com/fixture' } })
  expect(h.evaluate).toHaveBeenCalledTimes(1)
  expect(h.navigate).toHaveBeenCalledTimes(1)
})
