import { useScreenAmbientLightEnvironment, useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useScreenAmbientLight } from './use-screen-ambient-light'

const capture = vi.hoisted(() => ({ start: vi.fn(), read: vi.fn(), stop: vi.fn(async () => {}) }))
const permission = vi.hoisted(() => ({ check: vi.fn(async () => 'granted'), request: vi.fn(async () => {}) }))
vi.mock('@moeru/eventa', async (original) => {
  const eventa = await original<typeof import('@moeru/eventa')>()
  return { ...eventa, defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) => {
    if (event.sendEvent.id.includes('ambient-capture:start'))
      return capture.start
    if (event.sendEvent.id.includes('ambient-capture:read'))
      return capture.read
    return capture.stop
  } }
})
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { ref } = await import('vue')
  return {
    getElectronEventaContext: () => ({}),
    useElectronAllDisplays: () => ref([{ id: 17, bounds: { x: 0, y: 0, width: 1600, height: 1000 } }]),
    useElectronWindowBounds: () => ({ x: ref(0), y: ref(0), width: ref(400), height: ref(500) }),
  }
})
vi.mock('@proj-airi/electron-screen-capture/vue', () => ({
  useElectronScreenCapture: () => ({ checkMacOSPermission: permission.check, requestMacOSPermission: permission.request, selectWithSource: vi.fn() }),
}))

const scopes: ReturnType<typeof effectScope>[] = []
beforeEach(() => {
  vi.stubGlobal('electron', { ipcRenderer: {} })
  vi.stubGlobal('platform', 'darwin')
  permission.check.mockResolvedValue('granted')
  setActivePinia(createPinia())
  let session = 0
  capture.start.mockImplementation(async () => `capture-${++session}`)
  capture.read.mockResolvedValue({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) })
  const settings = useSettingsScreenAmbientLight()
  settings.screenAmbientLightEnabled = true
  settings.screenAmbientLightSource = 'screen-capture'
  settings.screenAmbientLightCaptureIntervalMs = 50
})
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  useSettingsScreenAmbientLight().screenAmbientLightEnabled = false
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function start() {
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useScreenAmbientLight())
}

describe('native capture recovery', () => {
  it('does not call macOS-only permission RPCs on other platforms', async () => {
    vi.stubGlobal('platform', 'linux')
    start()
    await vi.waitFor(() => expect(capture.start).toHaveBeenCalled())
    expect(permission.check).not.toHaveBeenCalled()
    expect(permission.request).not.toHaveBeenCalled()
  })

  it('requests undetermined screen-recording permission on macOS', async () => {
    permission.check.mockResolvedValue('not-determined')
    start()
    await vi.waitFor(() => expect(capture.start).toHaveBeenCalled())
    expect(permission.check).toHaveBeenCalled()
    expect(permission.request).toHaveBeenCalledOnce()
  })

  it('reconnects a lost session without changing the enabled preference', async () => {
    // ROOT CAUSE:
    // A lost native session wrote false into persisted settings. A transient
    // fullscreen transition therefore disabled lighting until the user intervened.
    start()
    await vi.waitFor(() => expect(useScreenAmbientLightEnvironment().active).toBe(true))
    capture.read.mockRejectedValueOnce(new Error('Screen capture session is no longer active.'))
    await vi.waitFor(() => expect(capture.start).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(useSettingsScreenAmbientLight().screenAmbientLightEnabled).toBe(true)
    expect(useScreenAmbientLightEnvironment().active).toBe(true)
  })

  it('bounds repeated failures and clears stale light without disabling the preference', async () => {
    start()
    await vi.waitFor(() => expect(useScreenAmbientLightEnvironment().active).toBe(true))
    capture.read.mockRejectedValue(new Error('Capture unavailable'))
    await vi.waitFor(() => expect(capture.start).toHaveBeenCalledTimes(4), { timeout: 4500 })
    await vi.waitFor(() => expect(useScreenAmbientLightEnvironment().active).toBe(false))
    expect(useSettingsScreenAmbientLight().screenAmbientLightEnabled).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(capture.start).toHaveBeenCalledTimes(4)
  })

  it('cancels recovery when the user disables lighting', async () => {
    start()
    await vi.waitFor(() => expect(useScreenAmbientLightEnvironment().active).toBe(true))
    capture.read.mockRejectedValueOnce(new Error('Capture interrupted'))
    await vi.waitFor(() => expect(capture.stop).toHaveBeenCalled())
    useSettingsScreenAmbientLight().screenAmbientLightEnabled = false
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 650))
    expect(capture.start).toHaveBeenCalledTimes(1)
    expect(useScreenAmbientLightEnvironment().active).toBe(false)
  })
})
