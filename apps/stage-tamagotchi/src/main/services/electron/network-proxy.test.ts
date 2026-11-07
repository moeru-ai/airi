import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NetworkProxyService } from './network-proxy'

vi.mock('electron', () => ({ app: {}, session: {} }))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'airi-network-proxy-test-'))
  directories.push(directory)
  const path = join(directory, 'proxy.json')
  const sessions = [{ setProxy: vi.fn().mockResolvedValue(undefined) }, { setProxy: vi.fn().mockResolvedValue(undefined) }]
  const service = new NetworkProxyService(sessions, path)
  await service.initialize()
  return { directory, path, sessions, service }
}

describe('desktop network proxy', () => {
  it('applies system defaults and saves the same custom route to both Sessions', async () => {
    const { service, sessions, path } = await fixture()
    expect(sessions[0].setProxy).toHaveBeenCalledWith({ mode: 'system' })
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    const config = { mode: 'custom' as const, address: 'socks5://127.0.0.1:1080', bypassRules: '*.internal' }
    await service.set(config)
    for (const target of sessions)
      expect(target.setProxy).toHaveBeenLastCalledWith({ mode: 'fixed_servers', proxyRules: config.address, proxyBypassRules: config.bypassRules })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(config)
    expect(listener).toHaveBeenCalledWith({ config, available: true })
    unsubscribe()
    await service.set({ ...config, mode: 'direct' })
    expect(listener).toHaveBeenCalledTimes(1)
    const restored = new NetworkProxyService(sessions, path)
    await restored.initialize()
    expect(restored.get().config.mode).toBe('direct')
  })

  it.each(['https://proxy:443', 'http://user:password@proxy:80', 'http://proxy/path', 'socks5://proxy', 'file:///proxy'])(
    'rejects invalid proxy address %s before changing Sessions',
    async (address) => {
      const { service, sessions } = await fixture()
      expect(() => service.set({ mode: 'custom', address, bypassRules: '' })).toThrow()
      expect(sessions[0].setProxy).toHaveBeenCalledTimes(1)
    },
  )

  it('restores both Sessions after a partial failure and permits a later save', async () => {
    const { service, sessions } = await fixture()
    sessions[1].setProxy.mockRejectedValueOnce(new Error('session failed'))
    await expect(service.set({ mode: 'direct', address: '', bypassRules: '' })).rejects.toThrow('session failed')
    for (const target of sessions)
      expect(target.setProxy).toHaveBeenLastCalledWith({ mode: 'system' })
    expect(service.get().config.mode).toBe('system')
    await service.set({ mode: 'direct', address: '', bypassRules: '' })
    expect(service.get().config.mode).toBe('direct')
  })

  it('reports unavailable state if restoration fails', async () => {
    const { service, sessions } = await fixture()
    sessions[1].setProxy.mockRejectedValue(new Error('session failed'))
    await expect(service.set({ mode: 'direct', address: '', bypassRules: '' })).rejects.toThrow()
    expect(service.get().available).toBe(false)
  })

  it('restores routing when the settings file cannot be saved', async () => {
    const { directory, sessions } = await fixture()
    const parent = join(directory, 'blocked')
    const service = new NetworkProxyService(sessions, join(parent, 'proxy.json'))
    await service.initialize()
    await writeFile(parent, 'not a directory')
    await expect(service.set({ mode: 'direct', address: '', bypassRules: '' })).rejects.toThrow()
    expect(service.get().config.mode).toBe('system')
    expect(sessions[0].setProxy).toHaveBeenLastCalledWith({ mode: 'system' })
  })

  it('serializes simultaneous saves and persists the last completed setting', async () => {
    const { service, path } = await fixture()
    await Promise.all([
      service.set({ mode: 'direct', address: '', bypassRules: '' }),
      service.set({ mode: 'custom', address: 'http://localhost:7890', bypassRules: '' }),
    ])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(service.get().config)
    expect(service.get().config.mode).toBe('custom')
  })
})
