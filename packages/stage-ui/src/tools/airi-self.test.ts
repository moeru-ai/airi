import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  airiSelf,
  clearAiriSelfNavigationBridge,
  hasAiriSelfNavigationBridge,
  setAiriSelfNavigationBridge,
} from './airi-self'

async function getTool(name: string) {
  const tools = await airiSelf()
  const tool = tools.find(entry => entry.function.name === name)

  expect(tool, `missing tool: ${name}`).toBeDefined()
  return tool!
}

describe('airiSelf', () => {
  afterEach(() => {
    clearAiriSelfNavigationBridge()
    vi.restoreAllMocks()
  })

  it('tracks whether the navigation bridge is installed', () => {
    expect(hasAiriSelfNavigationBridge()).toBe(false)

    setAiriSelfNavigationBridge({
      navigateTo: vi.fn(),
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    expect(hasAiriSelfNavigationBridge()).toBe(true)
  })

  it('opens known settings modules through the installed bridge', async () => {
    const navigateTo = vi.fn(async (path: string) => path)
    setAiriSelfNavigationBridge({
      navigateTo,
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    const tool = await getTool('airi_open_settings_module')
    const result = await tool.execute({ module: 'discord' }, undefined as never)

    expect(navigateTo).toHaveBeenCalledWith('/settings/modules/messaging-discord')
    expect(result).toEqual([
      {
        type: 'text',
        text: 'Navigated to settings module. Current route: /settings/modules/messaging-discord',
      },
    ])
  })

  it('accepts explicit /settings routes', async () => {
    const navigateTo = vi.fn(async (path: string) => path)
    setAiriSelfNavigationBridge({
      navigateTo,
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    const tool = await getTool('airi_open_settings_module')
    await tool.execute({ module: '/settings/system/general' }, undefined as never)

    expect(navigateTo).toHaveBeenCalledWith('/settings/system/general')
  })

  it('rejects empty module names before navigation', async () => {
    const navigateTo = vi.fn(async (path: string) => path)
    setAiriSelfNavigationBridge({
      navigateTo,
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    const tool = await getTool('airi_open_settings_module')

    await expect(tool.execute({ module: '   ' }, undefined as never)).rejects.toThrow(
      'Settings module must not be empty.',
    )
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('rejects unknown shorthand modules instead of fabricating a route', async () => {
    const navigateTo = vi.fn(async (path: string) => path)
    setAiriSelfNavigationBridge({
      navigateTo,
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    const tool = await getTool('airi_open_settings_module')

    await expect(tool.execute({ module: 'totally-made-up-module' }, undefined as never)).rejects.toThrow(
      'Unknown settings module "totally-made-up-module".',
    )
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('rejects explicit paths outside /settings', async () => {
    const navigateTo = vi.fn(async (path: string) => path)
    setAiriSelfNavigationBridge({
      navigateTo,
      getCurrentRoute: vi.fn().mockReturnValue('/chat'),
    })

    const tool = await getTool('airi_open_settings_module')

    await expect(tool.execute({ module: '/weird/path' }, undefined as never)).rejects.toThrow(
      'Invalid settings route "/weird/path".',
    )
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
