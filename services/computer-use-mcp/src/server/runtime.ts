import type {
  BrowserDomBridgeStatus,
  ComputerUseConfig,
  DesktopExecutor,
  TerminalRunner,
} from '../types'

import { resolveComputerUseConfig } from '../config'
import { createDryRunExecutor } from '../executors/dry-run'
import { createMacOSLocalExecutor } from '../executors/macos-local'
import { ComputerUseSession } from '../session'
import { RunStateManager } from '../state'
import { TaskMemoryManager } from '../task-memory/manager'
import { createLocalShellRunner } from '../terminal/runner'

interface RuntimeBrowserDomBridge {
  getStatus: () => BrowserDomBridgeStatus
  close: () => Promise<void>
}

interface CdpBridgeManager {
  probeAvailability: () => Promise<{
    endpoint: string
    connected: boolean
    connectable: boolean
    lastError?: string
  }>
  close: () => Promise<void>
}

export interface ComputerUseServerOptions {
  executorFactory?: (config: ComputerUseConfig) => DesktopExecutor
  terminalRunnerFactory?: (config: ComputerUseConfig) => TerminalRunner
}

export interface ComputerUseServerRuntime {
  config: ComputerUseConfig
  session: ComputerUseSession
  executor: DesktopExecutor
  terminalRunner: TerminalRunner
  browserDomBridge: RuntimeBrowserDomBridge
  cdpBridgeManager: CdpBridgeManager
  /** Unified run-level state manager. */
  stateManager: RunStateManager
  /** High-level task memory for the current session. */
  taskMemory: TaskMemoryManager
}

function createNoopBrowserDomBridge(config: ComputerUseConfig): RuntimeBrowserDomBridge {
  return {
    getStatus: () => ({
      enabled: config.browserDomBridge.enabled,
      host: config.browserDomBridge.host,
      port: config.browserDomBridge.port,
      connected: false,
      pendingRequests: 0,
      lastError: 'Browser surface is deferred to Chunk 3 (browser/devtools/demo).',
    }),
    close: async () => {},
  }
}

function createNoopCdpBridgeManager(): CdpBridgeManager {
  return {
    probeAvailability: async () => ({
      endpoint: 'http://127.0.0.1:9222',
      connected: false,
      connectable: false,
      lastError: 'Browser surface is deferred to Chunk 3 (browser/devtools/demo).',
    }),
    close: async () => {},
  }
}

function createExecutor(config: ComputerUseConfig, options: ComputerUseServerOptions = {}): DesktopExecutor {
  if (options.executorFactory)
    return options.executorFactory(config)

  if (config.executor === 'linux-x11')
    return createDryRunExecutor(config)
  if (config.executor === 'macos-local')
    return createMacOSLocalExecutor(config)

  return createDryRunExecutor(config)
}

function createTerminal(config: ComputerUseConfig, options: ComputerUseServerOptions = {}) {
  if (options.terminalRunnerFactory)
    return options.terminalRunnerFactory(config)

  return createLocalShellRunner(config)
}

export async function createRuntime(config = resolveComputerUseConfig(), options: ComputerUseServerOptions = {}) {
  const session = new ComputerUseSession(config)
  await session.init()
  const executor = createExecutor(config, options)
  const terminalRunner = createTerminal(config, options)
  const browserDomBridge = createNoopBrowserDomBridge(config)
  const cdpBridgeManager = createNoopCdpBridgeManager()
  const stateManager = new RunStateManager()
  const taskMemory = new TaskMemoryManager()
  session.setTerminalState(terminalRunner.getState())
  stateManager.updateTerminalState(terminalRunner.getState())

  return {
    config,
    session,
    executor,
    terminalRunner,
    browserDomBridge,
    cdpBridgeManager,
    stateManager,
    taskMemory,
  } satisfies ComputerUseServerRuntime
}
