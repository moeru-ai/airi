import { describe, expect, it } from 'vitest'

import { extractVideoId } from './sites'

describe('extractVideoId', () => {
  it('reads the video id of a YouTube watch URL', () => {
    expect(extractVideoId('youtube', 'https://example.com/watch?v=abc123')).toBe('abc123')
  })

  it('reads the video id of a Bilibili video URL', () => {
    expect(extractVideoId('bilibili', 'https://example.com/video/BV1xx411c7mD')).toBe('BV1xx411c7mD')
  })

  it('reads a different id for each Bilibili bangumi episode', () => {
    expect(extractVideoId('bilibili', 'https://example.com/bangumi/play/ep101')).toBe('ep101')
    expect(extractVideoId('bilibili', 'https://example.com/bangumi/play/ep102')).toBe('ep102')
  })
})
