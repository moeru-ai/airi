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

function createLiveVideoStream() {
  const track = {
    readyState: 'live',
    addEventListener: vi.fn(),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack

  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream
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
    vi.restoreAllMocks()
  })

  it('uses Electron desktop constraints while the selected-source lease is active', async () => {
    const stream = createLiveVideoStream()
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
    getUserMediaMock.mockImplementation(async () => {
      expect(selectingSource).toBe(true)
      return stream
    })

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).resolves.toBe(stream)

    expect(getUserMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({
        mandatory: expect.objectContaining({
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: 'screen:1:0',
        }),
      }),
    }))
    expect(getDisplayMediaMock).not.toHaveBeenCalled()
  })

  it('falls back to getDisplayMedia when Electron desktop constraints fail', async () => {
    const stream = createLiveVideoStream()
    selectWithSourceMock.mockImplementation(async (selectSource, useStream) => {
      expect(selectSource([{ id: 'screen:1:0', name: 'Screen 1' }])).toBe('screen:1:0')
      return await useStream()
    })
    getUserMediaMock.mockRejectedValue(new DOMException('Desktop capture unavailable', 'NotAllowedError'))
    getDisplayMediaMock.mockResolvedValue(stream)

    const screenCapture = useVisionScreenCapture({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    } satisfies SourcesOptions)
    screenCapture.activeSourceId.value = 'screen:1:0'

    await expect(screenCapture.startStream()).resolves.toBe(stream)

    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
    expect(getDisplayMediaMock).toHaveBeenCalledWith({ video: true, audio: false })
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
