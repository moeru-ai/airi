import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { DebugServerHandle } from '@proj-airi/debug-server'
import type { DebugServerConfig } from '@proj-airi/debug-server/config'

import type { DebugTracingState } from '../../../../shared/eventa'

import process from 'node:process'

import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { startDebugServer } from '@proj-airi/debug-server'
import { loadConfig } from '@proj-airi/debug-server/config'
import { Mutex } from 'async-mutex'

import { debugTracingChanged, debugTracingGet, debugTracingSetEnabled } from '../../../../shared/eventa'

const log = useLogg('debug-tracing').useGlobalConfig()

interface DebugTracingServiceOptions {
  allowedOrigins: Set<string>
  connectionPath: string
  databasePath: string
  getStoredEnabled: () => boolean
  setStoredEnabled: (enabled: boolean) => void
  startServer?: (config: DebugServerConfig) => Promise<DebugServerHandle>
}

export class DebugTracingService {
  private readonly listeners = new Set<(state: DebugTracingState) => void>()
  private readonly mutex = new Mutex()
  private handle: DebugServerHandle | undefined
  private error: string | undefined

  constructor(private readonly options: DebugTracingServiceOptions) {}

  getState(): DebugTracingState {
    if (!this.handle) {
      return {
        databasePath: this.options.databasePath,
        enabled: false,
        error: this.error,
      }
    }
    return {
      databasePath: this.handle.databasePath,
      enabled: true,
      endpoint: this.handle.endpoint,
      token: this.handle.token,
    }
  }

  onStateChange(listener: (state: DebugTracingState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async restore(): Promise<void> {
    if (!this.options.getStoredEnabled())
      return
    try {
      await this.setEnabled(true, false)
    }
    catch (error) {
      log.withError(error).error('Failed to restore local debug tracing')
    }
  }

  async setEnabled(enabled: boolean, persist = true): Promise<DebugTracingState> {
    return await this.mutex.runExclusive(async () => {
      if (enabled)
        await this.start()
      else
        await this.stop()

      if (persist)
        this.options.setStoredEnabled(enabled)
      const state = this.getState()
      this.emitState(state)
      return state
    })
  }

  async dispose(): Promise<void> {
    await this.mutex.runExclusive(() => this.stop())
  }

  private async start(): Promise<void> {
    if (this.handle)
      return
    this.error = undefined
    const defaults = loadConfig({ AIRI_DEBUG_DB_PATH: this.options.databasePath })
    const config: DebugServerConfig = {
      ...defaults,
      allowedOrigins: this.options.allowedOrigins,
    }
    try {
      await rm(this.options.connectionPath, { force: true })
      const handle = await (this.options.startServer ?? startDebugServer)(config)
      try {
        await mkdir(dirname(this.options.connectionPath), { recursive: true, mode: 0o700 })
        await writeFile(this.options.connectionPath, JSON.stringify({
          databasePath: handle.databasePath,
          endpoint: handle.endpoint,
          pid: process.pid,
          token: handle.token,
        }), { mode: 0o600 })
        await chmod(this.options.connectionPath, 0o600)
      }
      catch (error) {
        await handle.stop()
        throw error
      }
      this.handle = handle
    }
    catch (error) {
      this.error = errorMessageFrom(error) ?? 'Failed to start local debug tracing.'
      this.emitState()
      throw error
    }
  }

  private async stop(): Promise<void> {
    if (!this.handle)
      return
    await this.handle.stop()
    await rm(this.options.connectionPath, { force: true })
    this.handle = undefined
    this.error = undefined
  }

  private emitState(state = this.getState()): void {
    for (const listener of this.listeners)
      listener(state)
  }
}

export function registerDebugTracing(context: ReturnType<typeof createContext>['context'], service: DebugTracingService): () => void {
  const disposers = [
    defineInvokeHandler(context, debugTracingGet, () => service.getState()),
    defineInvokeHandler(context, debugTracingSetEnabled, payload => service.setEnabled(payload.enabled)),
    service.onStateChange(state => context.emit(debugTracingChanged, state)),
  ]
  return () => disposers.forEach(dispose => dispose())
}
