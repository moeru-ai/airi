import type { ChromeSessionManager } from '../chrome-session-manager'
import type { DesktopSessionController } from '../desktop-session'
import type { ComputerUseConfig, DesktopExecutor, TerminalRunner } from '../types'
import type { CdpBridgeManager } from './cdp-manager'

import { platform } from 'node:process'

import { BrowserDomExtensionBridge } from '../browser-dom/extension-bridge'
import { createChromeSessionManager } from '../chrome-session-manager'
import { resolveComputerUseConfig } from '../config'
import { createDesktopSessionController } from '../desktop-session'
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
}

export interface ComputerUseServerRuntime {
  config: ComputerUseConfig
  session: ComputerUseSession
  executor: DesktopExecutor
  terminalRunner: TerminalRunner
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
