import type { AuvClient, AuvConnection, AuvDaemon, RunnerClient, StartAuvOptions } from '@auv-js/sdk/node'

import type { ComputerUseConfig } from '../types'

import { existsSync } from 'node:fs'
import { sep } from 'node:path'

import { binaryPath as resolvePlatformBinaryPath } from '@auv-js/cli/binary'
import { createAuv, startAuv } from '@auv-js/sdk/node'

import { errorMessageFromValue } from '../utils/error-message'
import { AuvExecutorError } from './auv-errors'

const LOCAL_RUNNER_CLASS = 'auv.core.local'

export interface AuvSession {
  runner: RunnerClient
  auv: AuvClient
  connection: AuvConnection
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
  createClient?: (connection: AuvConnection) => AuvClient
}

function defaultBinaryPath(): string {
  try {
    return resolveAuvBinaryForExecution(resolvePlatformBinaryPath())
  }
  catch (error) {
    throw new AuvExecutorError(
      'unavailable',
      `cannot resolve the auv executable; install @auv-js/cli platform binaries or set COMPUTER_USE_AUV_BINARY_PATH (${errorMessageFromValue(error)})`,
      { cause: error },
    )
  }
}

export function resolveAuvBinaryForExecution(resolvedPath: string) {
  const packedSegment = `${sep}app.asar${sep}`
  if (!resolvedPath.includes(packedSegment))
    return resolvedPath

  const unpackedPath = resolvedPath.replace(packedSegment, `${sep}app.asar.unpacked${sep}`)
  if (!existsSync(unpackedPath)) {
    throw new AuvExecutorError('unavailable', `the packaged AUV executable was not unpacked at ${unpackedPath}`)
  }
  return unpackedPath
}

export function createAuvExecutorRuntime(config: ComputerUseConfig, hooks: AuvRuntimeHooks = {}): AuvExecutorRuntime {
  const startDaemon = hooks.startDaemon ?? startAuv
  const connectToDaemon = hooks.connect ?? ((daemon: AuvDaemon) => daemon.connect())
  const createClient = hooks.createClient ?? createAuv
  const resolveBinaryPath = hooks.resolveBinaryPath ?? defaultBinaryPath
  const abortController = new AbortController()
  let closed = false
  let starting: Promise<AuvSession> | undefined
  let session: AuvSession | undefined
  let daemon: AuvDaemon | undefined
  let ownedConnection: AuvConnection | undefined

  const markSessionDead = () => {
    session = undefined
    daemon = undefined
    const staleConnection = ownedConnection
    ownedConnection = undefined
    void staleConnection?.close().catch(() => {})
  }

  const buildSession = async (auv: AuvClient, connection: AuvConnection, daemonId: string | undefined): Promise<AuvSession> => {
    let deviceId: string | undefined
    try {
      deviceId = (await auv.devices.list({ signal: abortController.signal }))[0]?.id
    }
    catch {
      deviceId = undefined
    }

    const run = await auv.runs.create({ signal: abortController.signal })
    session = {
      runner: auv.runner({ runnerClass: LOCAL_RUNNER_CLASS, runId: run.id, signal: abortController.signal }),
      auv,
      connection,
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

    if (closed) {
      await started.stop().catch(() => {})
      throw new AuvExecutorError('unavailable', 'runtime is closed')
    }

    daemon = started
    void started.exited.then(() => {
      if (daemon === started)
        markSessionDead()
    }, () => {
      if (daemon === started)
        markSessionDead()
    })

    let connection: AuvConnection | undefined
    try {
      connection = await connectToDaemon(started)
      ownedConnection = connection
      return await buildSession(createClient(connection), connection, started.id)
    }
    catch (error) {
      await connection?.close().catch(() => {})
      if (ownedConnection === connection)
        ownedConnection = undefined
      markSessionDead()
      await started.stop().catch(() => {})
      throw error
    }
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
      const currentSession = session
      const currentDaemon = daemon
      session = undefined
      daemon = undefined
      if (currentSession?.runId) {
        await currentSession.auv.runs.stop({ runId: currentSession.runId, outcome: 'canceled' }).catch(() => {})
      }
      await currentSession?.connection.close().catch(() => {})
      ownedConnection = undefined
      await currentDaemon?.stop().catch(() => {})
    },
  }
}
