import type { ElectronEventaContext } from './snapshot'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureScreenSnapshotFile } from './snapshot'

vi.mock('@proj-airi/electron-screen-capture/renderer', () => ({
  setupElectronScreenCapture: vi.fn(),
}))

vi.mock('../environment', () => ({
  isStageTamagotchi: vi.fn(),
}))

describe('captureScreenSnapshotFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captures a screen thumbnail in electron environment when sources are available', async () => {
    const { setupElectronScreenCapture } = await import('@proj-airi/electron-screen-capture/renderer')
    const { isStageTamagotchi } = await import('../environment')

    vi.mocked(isStageTamagotchi).mockReturnValue(true)

    const dummyBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])
    const mockGetSources = vi.fn().mockResolvedValue([
      {
        id: 'screen:0:0',
        name: 'Entire Screen',
        thumbnail: dummyBytes,
      },
    ])

    vi.mocked(setupElectronScreenCapture).mockReturnValue({
      getSources: mockGetSources,
    } as any)

    const fakeContext = {} as ElectronEventaContext
    const result = await captureScreenSnapshotFile({
      context: fakeContext,
      fileName: 'test-shot.jpg',
      width: 1280,
      height: 720,
    })

    expect(result).toBeInstanceOf(File)
    expect(result?.name).toBe('test-shot.jpg')
    expect(result?.type).toBe('image/jpeg')
    expect(mockGetSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    })
  })

  it('falls back when electron desktop capturer returns empty thumbnail', async () => {
    const { setupElectronScreenCapture } = await import('@proj-airi/electron-screen-capture/renderer')
    const { isStageTamagotchi } = await import('../environment')

    vi.mocked(isStageTamagotchi).mockReturnValue(true)

    const mockGetSources = vi.fn().mockResolvedValue([
      {
        id: 'screen:0:0',
        name: 'Entire Screen',
        thumbnail: new Uint8Array(0),
      },
    ])

    vi.mocked(setupElectronScreenCapture).mockReturnValue({
      getSources: mockGetSources,
    } as any)

    const result = await captureScreenSnapshotFile({
      context: {} as ElectronEventaContext,
    })

    expect(result).toBeNull()
  })

  it('returns null when neither electron nor getDisplayMedia is supported', async () => {
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(false)

    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    })

    try {
      const result = await captureScreenSnapshotFile()
      expect(result).toBeNull()
    }
    finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      })
    }
  })
})
