import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostAutoUpdater } from './auto-updater'

const runtime = vi.hoisted(() => ({ value: 'kirie' as 'electron' | 'kirie' }))
const useElectronAutoUpdater = vi.hoisted(() => vi.fn())

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronAutoUpdater,
}))

vi.mock('./owner', () => ({
  initializeHostContext: () => ({ runtime: runtime.value }),
}))

describe('host auto updater', () => {
  beforeEach(() => {
    runtime.value = 'kirie'
    useElectronAutoUpdater.mockReset()
  })

  it('reports a disabled updater without accessing Electron in Kirie', async () => {
    // ROOT CAUSE:
    //
    // The About and updater routes called the Electron composable during setup.
    // Kirie has no Electron preload, so opening either route blanked the renderer.
    // The host boundary now returns an explicit disabled updater for Kirie.
    const updater = useHostAutoUpdater()

    expect(updater.isSupported).toBe(false)
    expect(updater.state.value).toEqual({ status: 'disabled' })
    await expect(updater.checkForUpdates()).resolves.toEqual({ status: 'disabled' })
    expect(useElectronAutoUpdater).not.toHaveBeenCalled()
  })

  it('delegates to the Electron updater in Electron', () => {
    runtime.value = 'electron'
    const electronUpdater = {
      state: { value: { status: 'idle' } },
      isBusy: { value: false },
      canDownload: { value: false },
      canRestartToUpdate: { value: false },
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    }
    useElectronAutoUpdater.mockReturnValue(electronUpdater)

    const updater = useHostAutoUpdater()

    expect(updater).toMatchObject(electronUpdater)
    expect(updater.isSupported).toBe(true)
  })
})
