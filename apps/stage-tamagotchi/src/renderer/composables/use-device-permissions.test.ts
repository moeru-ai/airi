import { electron } from '@proj-airi/electron-eventa'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDevicePermissions } from './use-device-permissions'

/** The main process answers, by contract. Each test sets the answers that it needs. */
const invokes = vi.hoisted(() => new Map<unknown, (request?: unknown) => Promise<unknown>>())

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (contract: unknown) => (request?: unknown) => {
    const handler = invokes.get(contract)
    if (!handler)
      throw new Error('The test did not answer this contract')
    return handler(request)
  },
}))

function onPlatform(userAgent: string) {
  vi.stubGlobal('navigator', { userAgent })
}

const macOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 Electron/40.0.0'
const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/40.0.0'
const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Electron/40.0.0'

describe('useDevicePermissions', () => {
  afterEach(() => {
    invokes.clear()
    vi.unstubAllGlobals()
  })

  it('lists the permissions of each platform', () => {
    onPlatform(macOS)
    expect(useDevicePermissions().map(permission => permission.id)).toEqual(['microphone', 'accessibility', 'screen-recording'])
    onPlatform(windows)
    expect(useDevicePermissions().map(permission => permission.id)).toEqual(['microphone'])
    onPlatform(linux)
    expect(useDevicePermissions()).toEqual([])
  })

  it('asks for the microphone on macOS before the system decided, and opens the settings after a denial', async () => {
    onPlatform(macOS)
    let status = 'not-determined'
    const askForMediaAccess = vi.fn(async () => true)
    const openPrivacySettings = vi.fn(async () => undefined)
    invokes.set(electron.systemPreferences.getMediaAccessStatus, async () => status)
    invokes.set(electron.systemPreferences.askForMediaAccess, askForMediaAccess)
    invokes.set(electron.systemPreferences.openPrivacySettings, openPrivacySettings)
    const [microphone] = useDevicePermissions()

    await microphone.request()
    expect(askForMediaAccess).toHaveBeenCalledWith(['microphone'])

    status = 'denied'
    expect(await microphone.check()).toBe('denied')
    await microphone.request()
    expect(openPrivacySettings).toHaveBeenCalledWith(['microphone'])
  })

  it('treats a policy restriction as a denial', async () => {
    onPlatform(windows)
    invokes.set(electron.systemPreferences.getMediaAccessStatus, async () => 'restricted')
    const [microphone] = useDevicePermissions()

    expect(await microphone.check()).toBe('denied')
  })

  it('prompts for Accessibility only on request', async () => {
    onPlatform(macOS)
    const isTrusted = vi.fn(async () => false)
    invokes.set(electron.systemPreferences.isTrustedAccessibilityClient, isTrusted)
    const accessibility = useDevicePermissions().find(permission => permission.id === 'accessibility')!

    expect(await accessibility.check()).toBe('not-determined')
    expect(isTrusted).toHaveBeenLastCalledWith([false])
    await accessibility.request()
    expect(isTrusted).toHaveBeenLastCalledWith([true])
  })
})
