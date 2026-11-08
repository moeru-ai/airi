import type { ChromeSessionManager } from '../chrome-session-manager'
import type { DesktopSessionController } from '../desktop-session'
import type { ComputerUseConfig, DesktopExecutor, TerminalRunner } from '../types'
import type { CdpBridgeManager } from './cdp-manager'

import { env, platform } from 'node:process'

import { terminalControlEnabledEnv, terminalControlNonceEnv } from '@proj-airi/stage-shared/terminal-approval'

import { BrowserDomExtensionBridge } from '../browser-dom/extension-bridge'
import { createChromeSessionManager } from '../chrome-session-manager'
import { resolveComputerUseConfig } from '../config'
import { createDesktopSessionController } from '../desktop-session'
import { createAuvExecutor } from '../executors/auv'
import { createDryRunExecutor } from '../executors/dry-run'
import { createLinuxX11Executor } from '../executors/linux-x11'
import { createMacOSLocalExecutor } from '../executors/macos-local'
import { ComputerUseSession } from '../session'
import { RunStateManager } from '../state'
import { TaskMemoryManager } from '../task-memory/manager'
import { createLocalShellRunner } from '../terminal/runner'
import { createCdpBridgeManager } from './cdp-manager'

export interface ComputerUseServerOptions {
  executorFactory?: (config: ComputerUseConfig) => DesktopExecutor
  terminalRunnerFactory?: (config: ComputerUseConfig) => TerminalRunner
  /** Only the controlling Host or a mock Host supplies this private-connection credential. It never comes from tool arguments. */
  terminalControlNonce?: string
}

export interface ComputerUseServerRuntime {
  config: ComputerUseConfig
  session: ComputerUseSession
  executor: DesktopExecutor
  terminalRunner: TerminalRunner
  terminalControlNonce?: string
  browserDomBridge: BrowserDomExtensionBridge
  cdpBridgeManager: CdpBridgeManager
  /** Unified run-level state manager. */
  stateManager: RunStateManager
  /** High-level task memory for the current session. */
  taskMemory: TaskMemoryManager
  /** Agent-owned Chrome session lifecycle manager. */
  chromeSessionManager: ChromeSessionManager
  /** Desktop session ownership controller. */
  desktopSessionController: DesktopSessionController
}

function createExecutor(config: ComputerUseConfig, options: ComputerUseServerOptions = {}): DesktopExecutor {
  if (options.executorFactory)
    return options.executorFactory(config)

  if (config.executor === 'macos-local' && platform !== 'darwin') {
    throw new Error(`macos-local executor requires a darwin host, current platform is ${platform}`)
  }

  if (config.executor === 'auv') {
    if (platform !== 'win32') {
      throw new Error(`auv executor requires a win32 host, current platform is ${platform}`)
    }
    const executor = createAuvExecutor(config)
    const reason = 'A trusted observation scope is required. Native AUV observation is unavailable.'
    // Keep Terminal registration independent. None of these metadata or observation paths can query the SDK.
    return {
      ...executor,
      describe: () => ({ kind: 'auv', notes: [reason] }),
      getForegroundContext: async () => ({ available: false, platform, unavailableReason: reason }),
      getDisplayInfo: async () => ({ available: false, platform, capturedAt: new Date().toISOString(), note: reason }),
      observeWindows: async () => { throw new Error(reason) },
    }
  }

  if (config.executor === 'linux-x11')
    return createLinuxX11Executor(config)
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
  const terminalControlNonce = options.terminalControlNonce
    ?? (env[terminalControlEnabledEnv] === '1' ? env[terminalControlNonceEnv] : undefined)
  if (terminalControlNonce !== undefined && !/^[a-f0-9]{64}$/.test(terminalControlNonce))
    throw new Error('Host Terminal control requires a valid private connection credential.')
  if (terminalControlNonce && config.approvalMode === 'never')
    throw new Error('Host-controlled Terminal requires server approval mode actions or all.')
  // Capture once so no executor or browser child inherits this private connection credential.
  delete env[terminalControlNonceEnv]
  const session = new ComputerUseSession(config)
  await session.init()
  const executor = createExecutor(config, options)
  const terminalRunner = createTerminal(config, options)
  const browserDomBridge = new BrowserDomExtensionBridge(config.browserDomBridge)
  const cdpBridgeManager = createCdpBridgeManager(config)
  await browserDomBridge.start()
  const stateManager = new RunStateManager()
  const taskMemory = new TaskMemoryManager()
  session.setTerminalState(terminalRunner.getState())
  stateManager.updateTerminalState(terminalRunner.getState())

  return {
    config,
    session,
    executor,
    terminalRunner,
    terminalControlNonce,
    browserDomBridge,
    cdpBridgeManager,
    stateManager,
    taskMemory,
    chromeSessionManager: createChromeSessionManager(config, {
      onSessionLost: () => {
        // NOTICE: Chrome session loss invalidates the agent-owned CDP endpoint.
        // Close the bridge proactively so later observe/ensure flows reconnect cleanly.
        cdpBridgeManager.close().catch(() => {})
      },
    }),
    desktopSessionController: createDesktopSessionController(stateManager),
  } satisfies ComputerUseServerRuntime
}
