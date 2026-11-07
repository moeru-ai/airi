import type { ElectronEventaContext } from './snapshot'

import { createContext } from '@moeru/eventa'
import { setupElectronScreenCapture } from '@proj-airi/electron-screen-capture/renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureScreenSnapshotFile, isScreenCaptureSupported } from './snapshot'

vi.mock('@proj-airi/electron-screen-capture/renderer', () => ({
  setupElectronScreenCapture: vi.fn(),
}))

vi.mock('../environment', () => ({
  isStageTamagotchi: vi.fn(),
}))

type CapturerInstance = ReturnType<typeof setupElectronScreenCapture>

function createMockScreenCapturer(getSources: CapturerInstance['getSources']): CapturerInstance {
  return {
    getSources,
    setSource: vi.fn(),
    selectWithSource: vi.fn(),
    resetSource: vi.fn(),
    checkMacOSPermission: vi.fn().mockResolvedValue('granted'),
    requestMacOSPermission: vi.fn().mockResolvedValue(true),
  }
}

function createMockEventaContext(): ElectronEventaContext {
  return createContext() as ElectronEventaContext
}

describe('captureScreenSnapshotFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captures a screen thumbnail in electron environment when sources are available', async () => {
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

    vi.mocked(setupElectronScreenCapture).mockReturnValue(createMockScreenCapturer(mockGetSources))

    const fakeContext = createMockEventaContext()
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
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(true)

    const mockGetSources = vi.fn().mockResolvedValue([
      {
        id: 'screen:0:0',
        name: 'Entire Screen',
        thumbnail: new Uint8Array(0),
      },
    ])

    vi.mocked(setupElectronScreenCapture).mockReturnValue(createMockScreenCapturer(mockGetSources))

    const fakeContext = createMockEventaContext()
    const result = await captureScreenSnapshotFile({
      context: fakeContext,
    })

    expect(result).toBeNull()
  })

  it('handles getDisplayMedia cancellation cleanly without throwing', async () => {
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(false)

    const notAllowedError = new Error('Permission denied')
    notAllowedError.name = 'NotAllowedError'

    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockRejectedValue(notAllowedError),
      },
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

describe('isScreenCaptureSupported', () => {
  it('returns true when context is provided in electron environment', async () => {
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(true)

    const fakeContext = createMockEventaContext()
    expect(isScreenCaptureSupported(fakeContext)).toBe(true)
  })

  it('returns true when getDisplayMedia is available in browser', async () => {
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(false)

    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn(),
      },
      configurable: true,
    })

    try {
      expect(isScreenCaptureSupported()).toBe(true)
    }
    finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      })
    }
  })

  it('returns false when getDisplayMedia is absent', async () => {
    const { isStageTamagotchi } = await import('../environment')
    vi.mocked(isStageTamagotchi).mockReturnValue(false)

    const originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    })

    try {
      expect(isScreenCaptureSupported()).toBe(false)
    }
    finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      })
    }
  })
})
