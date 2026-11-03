import type { AuvClient, AuvConnection, AuvDaemon, RunnerClient, StartAuvOptions } from '@auv-js/sdk/node'

import type { ComputerUseConfig } from '../types'

import { binaryPath as resolvePlatformBinaryPath } from '@auv-js/cli/binary'
import { createAuv, startAuv } from '@auv-js/sdk/node'

import { errorMessageFromValue } from '../utils/error-message'
import { AuvExecutorError } from './auv-errors'

const LOCAL_RUNNER_CLASS = 'auv.core.local'

export interface AuvSession {
  runner: RunnerClient
  runId?: string
  deviceId?: string
  daemonId?: string
}

export interface AuvExecutorRuntime {
  ensureSession: () => Promise<AuvSession>
  close: () => Promise<void>
}

export interface AuvRuntimeHooks {
  resolveBinaryPath?: () => string
  startDaemon?: (options: StartAuvOptions) => Promise<AuvDaemon>
  connect?: (daemon: AuvDaemon) => Promise<AuvConnection>
}

function defaultBinaryPath(): string {
  try {
    return resolvePlatformBinaryPath()
  }
  catch (error) {
    throw new AuvExecutorError(
      'unavailable',
      `cannot resolve the auv executable; install @auv-js/cli platform binaries or set COMPUTER_USE_AUV_BINARY_PATH (${errorMessageFromValue(error)})`,
      { cause: error },
    )
  }
}

export function createAuvExecutorRuntime(config: ComputerUseConfig, hooks: AuvRuntimeHooks = {}): AuvExecutorRuntime {
  const startDaemon = hooks.startDaemon ?? startAuv
  const connectToDaemon = hooks.connect ?? ((daemon: AuvDaemon) => daemon.connect())
  const resolveBinaryPath = hooks.resolveBinaryPath ?? defaultBinaryPath

  const abortController = new AbortController()
  let closed = false
  let starting: Promise<AuvSession> | undefined
  let session: AuvSession | undefined
  let daemon: AuvDaemon | undefined

  const markSessionDead = () => {
    session = undefined
    daemon = undefined
  }

  const buildSession = async (auv: AuvClient, daemonId: string | undefined): Promise<AuvSession> => {
    let deviceId: string | undefined
    try {
      deviceId = (await auv.devices.list())[0]?.id
    }
    catch {
      deviceId = undefined
    }

    const run = await auv.runs.create({})
    session = {
      runner: auv.runner({ runnerClass: LOCAL_RUNNER_CLASS, runId: run.id }),
      runId: run.id,
      deviceId,
      daemonId,
    }
    return session
  }

  const startOwnedSession = async (): Promise<AuvSession> => {
    const started = await startDaemon({
      binaryPath: config.auv.binaryPath || resolveBinaryPath(),
      storeRoot: config.auv.storeRoot,
      noRegister: true,
      signal: abortController.signal,
      startupTimeoutMs: config.auv.startupTimeoutMs,
      shutdownTimeoutMs: config.auv.shutdownTimeoutMs,
    })
    daemon = started
    void started.exited.then(() => {
      if (daemon === started)
        markSessionDead()
    }, () => {
      if (daemon === started)
        markSessionDead()
    })

    const connection = await connectToDaemon(started)
    return await buildSession(createAuv(connection), started.id)
  }

  return {
    ensureSession: () => {
      if (closed)
        return Promise.reject(new AuvExecutorError('unavailable', 'runtime is closed'))

      if (session)
        return Promise.resolve(session)

      starting ??= startOwnedSession().finally(() => {
        starting = undefined
      })
      return starting
    },
    close: async () => {
      if (closed)
        return
      closed = true
      abortController.abort()
      const current = daemon
      markSessionDead()
      if (current) {
        try {
          await current.stop()
        }
        catch {
          // Ignore shutdown errors during cleanup.
        }
      }
    },
  }
}
