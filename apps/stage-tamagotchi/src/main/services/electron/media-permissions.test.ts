import type { WebContents } from 'electron'

import { describe, expect, it } from 'vitest'

import { shouldGrantAudioCapturePermission } from './media-permissions'

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
})
