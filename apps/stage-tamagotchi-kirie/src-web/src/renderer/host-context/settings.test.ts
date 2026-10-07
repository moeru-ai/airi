import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostSettings } from './settings'

const state = vi.hoisted(() => ({
  android: false,
  openDesktopSettings: vi.fn(),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../window-context', () => ({
  isAndroidRenderer: () => state.android,
}))

vi.mock('./owner', () => ({
  useHostEventaInvoke: () => state.openDesktopSettings,
}))

describe('host settings', () => {
  beforeEach(() => {
    state.android = false
    state.openDesktopSettings.mockReset().mockResolvedValue(undefined)
    state.push.mockReset().mockResolvedValue(undefined)
  })

  it('routes inside the Android WebView', async () => {
    state.android = true

    await useHostSettings()({ route: '/settings/system/permissions' })

    expect(state.push).toHaveBeenCalledWith('/settings/system/permissions')
    expect(state.openDesktopSettings).not.toHaveBeenCalled()
  })

  it('opens the desktop settings window', async () => {
    await useHostSettings()({ route: '/settings/account' })

    expect(state.openDesktopSettings).toHaveBeenCalledWith({ route: '/settings/account' })
    expect(state.push).not.toHaveBeenCalled()
  })
})
