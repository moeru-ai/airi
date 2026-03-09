import type { ComputerUseConfig, DesktopExecutor, TerminalRunner } from '../types'

import { resolveComputerUseConfig } from '../config'
import { createDryRunExecutor } from '../executors/dry-run'
import { createLinuxX11Executor } from '../executors/linux-x11'
import { createMacOSLocalExecutor } from '../executors/macos-local'
import { ComputerUseSession } from '../session'
import { RunStateManager } from '../state'
import { createLocalShellRunner } from '../terminal/runner'

export interface ComputerUseServerOptions {
  executorFactory?: (config: ComputerUseConfig) => DesktopExecutor
  terminalRunnerFactory?: (config: ComputerUseConfig) => TerminalRunner
}

export interface ComputerUseServerRuntime {
  config: ComputerUseConfig
  session: ComputerUseSession
  executor: DesktopExecutor
  terminalRunner: TerminalRunner
  /** Unified run-level state manager. */
  stateManager: RunStateManager
}

function createExecutor(config: ComputerUseConfig, options: ComputerUseServerOptions = {}): DesktopExecutor {
  if (options.executorFactory)
    return options.executorFactory(config)

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
  const stateManager = new RunStateManager()
  session.setTerminalState(terminalRunner.getState())
  stateManager.updateTerminalState(terminalRunner.getState())

  return {
    config,
    session,
    executor,
    terminalRunner,
    stateManager,
  } satisfies ComputerUseServerRuntime
}
