// @vitest-environment jsdom

import type { SourcesOptions } from 'electron'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSourcesMock = vi.fn()
const selectWithSourceMock = vi.fn()

vi.mock('@proj-airi/electron-screen-capture/vue', () => ({
  useElectronScreenCapture: () => ({
    getSources: getSourcesMock,
    selectWithSource: selectWithSourceMock,
  }),
}))

function createVideoStream(state: MediaStreamTrackState = 'live') {
  let onEnded: (() => void) | undefined
  const track = {
    readyState: state,
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'ended')
        onEnded = listener
    }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack

  return {
    stream: {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream,
    track,
    end() {
      (track as { readyState: MediaStreamTrackState }).readyState = 'ended'
      onEnded?.()
    },
  }
}

describe('useVisionScreenCapture', async () => {
  const { useVisionScreenCapture } = await import('./use-vision-screen-capture')
  const getDisplayMediaMock = vi.fn()
  const getUserMediaMock = vi.fn()

  beforeEach(() => {
    Object.assign(window, {
      electron: {
        ipcRenderer: {},
      },
    })
    Object.assign(navigator, {
      mediaDevices: {
        getDisplayMedia: getDisplayMediaMock,
        getUserMedia: getUserMediaMock,
      },
    })
    getSourcesMock.mockReset()
    getDisplayMediaMock.mockReset()
    getUserMediaMock.mockReset()
    selectWithSourceMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses selected getDisplayMedia while the selected-source lease is active', async () => {
    const { stream } = createVideoStream()
    let selectingSource = false
    selectWithSourceMock.mockImplementation(async (selectSource, useStream, request) => {
      expect(selectSource([{ id: 'screen:1:0', name: 'Screen 1' }])).toBe('screen:1:0')
      expect(request).toEqual({ timeout: 15_000 })
      selectingSource = true
      try {
        return await useStream()
      }
      finally {
        selectingSource = false
      }
    })
    getDisplayMediaMock.mockImplementation(async () => {
      expect(selectingSource).toBe(true)
      return stream
    })

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).resolves.toBe(stream)

    expect(getDisplayMediaMock).toHaveBeenCalledWith({ video: true, audio: false })
    expect(getUserMediaMock).not.toHaveBeenCalled()
  })

  it('falls back to Electron desktop constraints when selected getDisplayMedia fails', async () => {
    const { stream } = createVideoStream()
    selectWithSourceMock.mockImplementation(async (selectSource, useStream) => {
      expect(selectSource([{ id: 'screen:1:0', name: 'Screen 1' }])).toBe('screen:1:0')
      return await useStream()
    })
    getDisplayMediaMock.mockRejectedValue(new DOMException('Display capture unavailable', 'NotAllowedError'))
    getUserMediaMock.mockResolvedValue(stream)

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).resolves.toBe(stream)

    expect(getDisplayMediaMock).toHaveBeenCalledWith({ video: true, audio: false })
    expect(getUserMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({
        mandatory: expect.objectContaining({
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: 'screen:1:0',
        }),
      }),
    }))
  })

  it('retries a temporarily unreadable selected source after the prior lease is released', async () => {
    vi.useFakeTimers()
    const { stream } = createVideoStream()
    selectWithSourceMock.mockImplementation(async (selectSource, useStream) => {
      expect(selectSource([{ id: 'screen:1:0', name: 'Screen 1' }])).toBe('screen:1:0')
      return await useStream()
    })
    getDisplayMediaMock
      .mockRejectedValueOnce(new DOMException('Could not start video source', 'NotReadableError'))
      .mockResolvedValueOnce(stream)
    getUserMediaMock.mockRejectedValueOnce(new DOMException('Could not start video source', 'NotReadableError'))

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    const start = screenCapture.startStream()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(500)

    await expect(start).resolves.toBe(stream)
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(2)
    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
  })

  it('releases an ended stream before reacquiring the selected source', async () => {
    const first = createVideoStream()
    const second = createVideoStream()
    let requestCount = 0
    selectWithSourceMock.mockImplementation(async (selectSource, useStream) => {
      expect(selectSource([{ id: 'screen:1:0', name: 'Screen 1' }])).toBe('screen:1:0')
      return await useStream()
    })
    getDisplayMediaMock.mockImplementation(async () => {
      requestCount += 1
      if (requestCount === 1)
        return first.stream

      expect(first.track.stop).toHaveBeenCalledTimes(1)
      return second.stream
    })

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).resolves.toBe(first.stream)
    first.end()

    await expect(screenCapture.startStream()).resolves.toBe(second.stream)
    expect(first.track.stop).toHaveBeenCalledTimes(1)
  })

  it('rejects a source that disappears before a stream request starts', async () => {
    selectWithSourceMock.mockImplementation(async (selectSource) => {
      selectSource([{ id: 'screen:2:0', name: 'Screen 2' }])
    })

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).rejects.toThrow('Selected capture source "screen:1:0" is no longer available')

    expect(getDisplayMediaMock).not.toHaveBeenCalled()
    expect(getUserMediaMock).not.toHaveBeenCalled()
  })

  it('captures a fresh desktopCapturer thumbnail without opening a media stream', async () => {
    getSourcesMock.mockResolvedValue([{
      id: 'screen:1:0',
      name: 'Screen 1',
      thumbnail: new Uint8Array([0xFF, 0xD8, 0xFF]),
    }])

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 768, height: 432 },
    } satisfies SourcesOptions)

    await expect(
      screenCapture.captureSourceThumbnail('screen:1:0'),
    ).resolves.toMatch(/^data:image\/jpeg;base64,/)

    expect(getUserMediaMock).not.toHaveBeenCalled()
    expect(getDisplayMediaMock).not.toHaveBeenCalled()
  })
})
