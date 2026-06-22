import type { WebContents } from 'electron'

import { describe, expect, it } from 'vitest'

import { shouldGrantAudioCapturePermission, shouldGrantElectronPermission } from './media-permissions'

const localWebContents = {
  getURL: () => 'file:///app/index.html',
}

describe('media permissions', () => {
  it('grants local audio media permission requests', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      undefined,
      { mediaTypes: ['audio'] },
    )).toBe(true)
  })

  it('rejects video-only media permission requests', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      undefined,
      { mediaTypes: ['video'] },
    )).toBe(false)
  })

  it('rejects media permission requests that include video', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      undefined,
      { mediaTypes: ['audio', 'video'] },
    )).toBe(false)
  })

  it('rejects microphone permission requests when future Electron details include video', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'microphone',
      undefined,
      { mediaTypes: ['audio', 'video'] },
    )).toBe(false)
  })

  it('rejects audio capture permission requests when future Electron details include video', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'audioCapture',
      undefined,
      { mediaTypes: ['video'] },
    )).toBe(false)
  })

  it('does not treat missing media details as audio', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      undefined,
      {},
    )).toBe(false)
  })

  it('rejects audio requests from non-local origins', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'https://example.com',
      { mediaTypes: ['audio'] },
    )).toBe(false)
  })

  it('rejects remote frame requests even when the host window is local', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      undefined,
      { mediaTypes: ['audio'], requestingUrl: 'https://example.com/frame.html' },
    )).toBe(false)
  })

  it('grants audio requests with explicit local requester URLs', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'http://localhost:5173',
      { mediaTypes: ['audio'], securityOrigin: 'http://localhost:5173' },
    )).toBe(true)
  })

  it('ignores opaque file origins when packaged local pages request audio', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents as unknown as WebContents,
      'media',
      'null',
      { mediaTypes: ['audio'], requestingUrl: 'file:///app/index.html' },
    )).toBe(true)
  })

  it('grants display capture requests from local app pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents as unknown as WebContents,
      'display-capture',
      undefined,
      { requestingUrl: 'file:///app/index.html' },
    )).toBe(true)
  })

  it('rejects display capture requests from remote pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents as unknown as WebContents,
      'display-capture',
      undefined,
      { requestingUrl: 'https://example.com/capture.html' },
    )).toBe(false)
  })

  it('grants sanitized clipboard writes from local app pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents as unknown as WebContents,
      'clipboard-sanitized-write',
      'file:///app/index.html',
      {},
    )).toBe(true)
  })

  it('rejects unrelated permissions instead of granting all local requests', () => {
    expect(shouldGrantElectronPermission(
      localWebContents as unknown as WebContents,
      'notifications',
      'file:///app/index.html',
      {},
    )).toBe(false)
  })
})
