import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostDisplays } from './displays'

const invoke = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) => {
      return (...args: unknown[]) => invoke(event.sendEvent.id, ...args)
    },
  }
})

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    runtime: 'kirie',
  }),
}))

describe('host displays', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({
      bounds: { x: 0, y: 0, width: 3024, height: 1964 },
      workArea: { x: 0, y: 48, width: 3024, height: 1816 },
      scale: 2,
    })
  })

  // ROOT CAUSE:
  //
  // The Kirie renderer used the full display bounds as its work area and converted
  // them with the WebView device-pixel ratio. This lost Godot's native menu-bar and
  // dock exclusions and could use a scale from a different display.
  //
  // We fixed this by fetching bounds, usable work area, and scale as one native
  // snapshot and converting both rectangles with that snapshot's scale.
  it('uses the native usable area and scale from the same Godot display snapshot', async () => {
    const displays = useHostDisplays()

    await vi.waitFor(() => {
      expect(displays.value).toEqual([{
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
        workArea: { x: 0, y: 24, width: 1512, height: 908 },
      }])
    })

    expect(invoke).toHaveBeenCalledWith(
      'eventa:invoke:airi:desktop:current-display:get-send',
      {},
    )
  })
})
