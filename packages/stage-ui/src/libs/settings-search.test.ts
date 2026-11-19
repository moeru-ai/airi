import type { SettingsSearchModule } from './settings-search'

import { describe, expect, it, vi } from 'vitest'

import { SettingsSearchRegistry } from './settings-search'

const listNothing = () => []

describe('settings search registry', () => {
  it('gives a route to the entry with the longest path that holds it', () => {
    const registry = new SettingsSearchRegistry()
    const mcp = { path: '/settings/modules/mcp', items: listNothing }
    registry.provide('settings:modules', { routes: ['/settings/modules'] })
    registry.provide('modules:mcp', { routes: [mcp] })

    expect(registry.ownerOf('/settings/modules/mcp')).toEqual({ route: mcp, exact: true, active: true })
    expect(registry.ownerOf('/settings/modules/speech')).toEqual({ route: { path: '/settings/modules' }, exact: false, active: true })
    expect(registry.ownerOf('/settings/modules-preview')).toBeUndefined()
    expect(registry.ownerOf('/settings/scene')).toBeUndefined()
  })

  it('turns off the routes of a module while its condition is false, with the routes that other modules hold below them', () => {
    const registry = new SettingsSearchRegistry()
    let flagEnabled = false
    registry.provide('modules:hearing', { when: () => flagEnabled, routes: ['/settings/modules/hearing'] })
    registry.provide('modules:transcriber', { routes: [{ path: '/settings/modules/hearing/transcriber', items: listNothing }] })

    expect(registry.ownerOf('/settings/modules/hearing')?.active).toBe(false)
    expect(registry.ownerOf('/settings/modules/hearing/transcriber')?.active).toBe(false)

    flagEnabled = true
    expect(registry.ownerOf('/settings/modules/hearing')?.active).toBe(true)
    expect(registry.ownerOf('/settings/modules/hearing/transcriber')?.active).toBe(true)
  })

  it('lists lazy modules in the order that the app provided them, not in the order that they load', async () => {
    const registry = new SettingsSearchRegistry()
    const module: SettingsSearchModule = { routes: [] }
    let finishSlow: () => void = () => {}
    registry.provide('slow', () => new Promise(resolve => finishSlow = () => resolve({ default: module })))
    registry.provide('fast', async () => ({ default: module }))
    registry.provide('inline', module)

    const loading = registry.load()
    await vi.waitFor(() => expect([...registry.modules.keys()]).toEqual(['fast', 'inline']))
    finishSlow()
    await loading

    expect([...registry.modules.keys()]).toEqual(['slow', 'fast', 'inline'])
  })

  it('keeps the other modules when one fails to load', async () => {
    const registry = new SettingsSearchRegistry()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registry.provide('broken', () => Promise.reject(new Error('chunk failed')))
    registry.provide('scene', { routes: ['/settings/scene'] })

    await registry.load()

    expect([...registry.modules.keys()]).toEqual(['scene'])
    expect(warn).toHaveBeenCalledWith('[settings search] The module broken did not load:', 'chunk failed')
    warn.mockRestore()
  })

  it('rejects a name that is provided twice', () => {
    const registry = new SettingsSearchRegistry()
    registry.provide('modules:mcp', { routes: ['/settings/modules/mcp'] })

    expect(() => registry.provide('modules:mcp', { routes: [] })).toThrow('Settings search module "modules:mcp" is provided more than once.')
  })
})
