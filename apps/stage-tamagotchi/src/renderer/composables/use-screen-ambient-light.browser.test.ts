import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import { useScreenAmbientLight } from './use-screen-ambient-light'

/**
 * Two displays side by side. The window starts on the left one and the cases
 * move it by writing these refs, which is what the Electron bounds loop does.
 */
const displays = [
  { id: 17, bounds: { x: 0, y: 0, width: 1600, height: 1000 } },
  { id: 18, bounds: { x: 1600, y: 0, width: 1600, height: 1000 } },
]
const windowBounds = vi.hoisted(() => ({ x: 100, y: 100, width: 400, height: 500 }))
const bounds = { x: ref(windowBounds.x), y: ref(windowBounds.y), width: ref(windowBounds.width), height: ref(windowBounds.height) }

/** Records which display each capture was opened for. */
const selectedDisplayIds = vi.hoisted(() => [] as string[])
/** Sources the main process offers; each case sets what it needs. */
const offeredSources = vi.hoisted(() => ({ list: [] as { id: string, display_id: string }[] }))

vi.mock('@proj-airi/electron-vueuse', async () => {
  const { ref } = await import('vue')
  return {
    useElectronAllDisplays: () => ref(displays),
    useElectronWindowBounds: () => bounds,
  }
})

vi.mock('@proj-airi/electron-screen-capture/vue', () => ({
  useElectronScreenCapture: () => ({
    checkMacOSPermission: vi.fn(async () => 'granted'),
    requestMacOSPermission: vi.fn(async () => {}),
    // The composable picks a source from the list the main process would
    // return. The pick is recorded and a canvas stream plays in its place,
    // which is a real MediaStream that the video element can decode.
    selectWithSource: async (select: (sources: { id: string, display_id: string }[]) => string) => {
      const id = select(offeredSources.list)
      selectedDisplayIds.push(id)
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 40
      canvas.getContext('2d')!.fillRect(0, 0, 64, 40)
      return canvas.captureStream(5)
    },
  }),
}))

const scopes: ReturnType<typeof effectScope>[] = []

beforeEach(() => {
  vi.stubGlobal('electron', { ipcRenderer: {} })
  vi.stubGlobal('platform', 'linux')
  setActivePinia(createPinia())
  selectedDisplayIds.length = 0
  offeredSources.list = displays.map(display => ({ id: `screen:${display.id}:0`, display_id: String(display.id) }))
  bounds.x.value = windowBounds.x
  bounds.y.value = windowBounds.y
  const settings = useSettingsScreenAmbientLight()
  settings.screenAmbientLightEnabled = true
  settings.screenAmbientLightSource = 'screen-capture'
})

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  useSettingsScreenAmbientLight().screenAmbientLightEnabled = false
  vi.unstubAllGlobals()
})

function mount() {
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useScreenAmbientLight())
}

describe('screen ambient light capture', () => {
  it('captures the display the window sits on', async () => {
    mount()

    await vi.waitFor(() => expect(selectedDisplayIds).toEqual(['screen:17:0']))
  })

  it('restarts the capture on the new display once the window has moved there', async () => {
    // ROOT CAUSE:
    //
    // The display was chosen once in start(), and only the switch or the
    // source restarted the capture. A window dragged onto another display kept
    // the old stream, and each sample normalized the new position against the
    // old bounds. The capture now restarts once the dominant display changes.
    mount()
    await vi.waitFor(() => expect(selectedDisplayIds).toEqual(['screen:17:0']))

    bounds.x.value = 1600 + 100

    await vi.waitFor(() => expect(selectedDisplayIds).toEqual(['screen:17:0', 'screen:18:0']), { timeout: 3000 })
  })

  it('takes the only screen source when no display id matches', async () => {
    // A Wayland portal returns one source with no display id. With one screen
    // the choice is forced, so the capture starts on it.
    offeredSources.list = [{ id: 'screen:0:0', display_id: '' }]
    mount()

    await vi.waitFor(() => expect(selectedDisplayIds).toEqual(['screen:0:0']))
  })

  it('refuses an arbitrary screen when several are offered and none matches', async () => {
    // ROOT CAUSE:
    //
    // With no display id match the selection took the first screen source
    // and normalized against the window's display, so the light came from one
    // screen and was placed by another. Several unmatched screens now fail
    // the start, which switches the feature off with an error.
    offeredSources.list = [{ id: 'screen:0:0', display_id: '' }, { id: 'screen:1:0', display_id: '' }]
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount()

    await vi.waitFor(() => expect(useSettingsScreenAmbientLight().screenAmbientLightEnabled).toBe(false))
    expect(selectedDisplayIds).toEqual([])
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('No screen-capture source matches display 17'))
    errors.mockRestore()
  })

  it('does not restart while the window only crosses the boundary briefly', async () => {
    // A window dragged across the seam and back within the settle time has not
    // moved displays. Restarting a capture costs a new getDisplayMedia call and
    // a gap in the light, so a short excursion must not trigger it.
    mount()
    await vi.waitFor(() => expect(selectedDisplayIds).toEqual(['screen:17:0']))

    bounds.x.value = 1600 + 100
    await new Promise(resolve => setTimeout(resolve, 100))
    bounds.x.value = windowBounds.x
    await new Promise(resolve => setTimeout(resolve, 1200))

    expect(selectedDisplayIds).toEqual(['screen:17:0'])
  })
})
