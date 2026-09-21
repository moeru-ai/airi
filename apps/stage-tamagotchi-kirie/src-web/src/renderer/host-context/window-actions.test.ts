import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostAlwaysOnTop, useHostWindowCenter, useHostWindowMove } from './window-actions'

const platform = vi.hoisted(() => ({
  beginMove: vi.fn(),
  centerOnCurrentDisplay: vi.fn(),
  setAlwaysOnTop: vi.fn(),
}))
const hostOs = vi.hoisted(() => ({ value: 'macos' }))

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    platform: { hostWindow: platform },
    runtime: 'kirie',
    os: hostOs.value,
  }),
}))

describe('kirie host window actions', () => {
  beforeEach(() => {
    hostOs.value = 'macos'
    platform.beginMove.mockReset().mockResolvedValue(undefined)
    platform.centerOnCurrentDisplay.mockReset().mockResolvedValue(undefined)
    platform.setAlwaysOnTop.mockReset().mockResolvedValue(undefined)
  })

  it('uses Kirie Platform for always-on-top state', async () => {
    await useHostAlwaysOnTop()(true)

    expect(platform.setAlwaysOnTop).toHaveBeenCalledWith(true)
  })

  it('uses Kirie Platform to begin native window movement', async () => {
    const move = useHostWindowMove()

    expect(move.isNativeMoveSupported.value).toBe(true)
    expect(move.usesCssDragRegion.value).toBe(false)

    await move.beginMove()

    expect(platform.beginMove).toHaveBeenCalledOnce()
  })

  it('uses Kirie Platform to center the host window', async () => {
    await useHostWindowCenter()()

    expect(platform.centerOnCurrentDisplay).toHaveBeenCalledOnce()
  })

  it('does not start a desktop window drag on Android', async () => {
    hostOs.value = 'android'
    const move = useHostWindowMove()

    expect(move.isNativeMoveSupported.value).toBe(false)
    await move.beginMove()
    expect(platform.beginMove).not.toHaveBeenCalled()
  })

  it('propagates a native movement failure', async () => {
    const error = new Error('move failed')
    platform.beginMove.mockRejectedValueOnce(error)

    await expect(useHostWindowMove().beginMove()).rejects.toBe(error)
  })

  it('propagates a window centering failure', async () => {
    const error = new Error('center failed')
    platform.centerOnCurrentDisplay.mockRejectedValueOnce(error)

    await expect(useHostWindowCenter()()).rejects.toBe(error)
  })
})
