import type { ProxyConfig, Session } from 'electron'

import type { NetworkProxyConfig, NetworkProxyState } from '../../../shared/eventa/network-proxy'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { app, session } from 'electron'
import { injeca } from 'injeca'
import { parse } from 'valibot'

import { networkProxyConfigSchema } from '../../../shared/eventa/network-proxy'

/**
 * Owns the committed device settings and serializes Session updates with atomic file saves.
 * It never closes sockets: existing HTTP connections and WebSockets retain their route.
 */
export class NetworkProxyService {
  private config: NetworkProxyConfig = { mode: 'system', address: '', bypassRules: '' }
  private available = false
  private pending: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<(state: NetworkProxyState) => void>()

  constructor(private readonly sessions: Pick<Session, 'setProxy'>[], private readonly path: string) {}

  async initialize(): Promise<void> {
    try {
      this.config = parse(networkProxyConfigSchema, JSON.parse(await readFile(this.path, 'utf8')))
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw error
      // A new device has no saved preference and starts with the system proxy.
    }
    await this.apply(this.config)
    this.available = true
  }

  get(): NetworkProxyState {
    return { config: { ...this.config }, available: this.available }
  }

  subscribe(listener: (state: NetworkProxyState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Resolves only after every Session and the settings file accept the new configuration. */
  set(input: NetworkProxyConfig): Promise<NetworkProxyState> {
    const config = parse(networkProxyConfigSchema, input)
    const operation = this.pending.then(() => this.commit(config))
    // A failed save must not prevent the user from submitting a corrected configuration.
    this.pending = operation.catch(() => {})
    return operation
  }

  private async apply(config: NetworkProxyConfig): Promise<void> {
    const options: ProxyConfig = config.mode === 'custom'
      ? { mode: 'fixed_servers', proxyRules: config.address, proxyBypassRules: config.bypassRules }
      : { mode: config.mode }
    const results = await Promise.allSettled(this.sessions.map(target => target.setProxy(options)))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected')
      throw failure.reason
  }

  private broadcast(): void {
    for (const listener of this.listeners)
      listener(this.get())
  }

  private async commit(config: NetworkProxyConfig): Promise<NetworkProxyState> {
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`
    try {
      await this.apply(config)
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(temporaryPath, JSON.stringify(config), 'utf8')
      await rename(temporaryPath, this.path)
    }
    catch (error) {
      try {
        await this.apply(this.config)
        this.available = true
      }
      catch {
        this.available = false
      }
      this.broadcast()
      throw error
    }
    finally {
      await rm(temporaryPath, { force: true }).catch(() => {})
    }
    this.config = config
    this.available = true
    this.broadcast()
    return this.get()
  }
}

/** Resolves before windows load. Both Sessions share routing settings, but never share cookies. */
export const networkProxyService = injeca.provide('services:network-proxy', async () => {
  const service = new NetworkProxyService([
    session.defaultSession,
    session.fromPartition('airi-ai-transport', { cache: false }),
  ], join(app.getPath('userData'), 'network-proxy.json'))
  await service.initialize()
  return service
})
