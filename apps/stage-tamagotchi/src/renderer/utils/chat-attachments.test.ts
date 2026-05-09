import { afterEach, describe, expect, it, vi } from 'vitest'

import { recreateAttachmentObjectUrls, revokeAttachmentObjectUrls, type ChatImageAttachment } from './chat-attachments'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat attachment object URLs', () => {
  it('recreates preview object URLs from stored base64 data before restoring attachments', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:fresh-preview')

    const restored = recreateAttachmentObjectUrls([
      {
        type: 'image',
        data: 'aGVsbG8=',
        mimeType: 'image/png',
        url: 'blob:original-preview',
      },
    ])

    expect(restored).toEqual([
      {
        type: 'image',
        data: 'aGVsbG8=',
        mimeType: 'image/png',
        url: 'blob:fresh-preview',
      },
    ])
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
  })

  it('revokes every attachment object URL', () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const attachments: ChatImageAttachment[] = [
      { type: 'image', data: 'Zmlyc3Q=', mimeType: 'image/png', url: 'blob:first' },
      { type: 'image', data: 'c2Vjb25k', mimeType: 'image/jpeg', url: 'blob:second' },
    ]

    revokeAttachmentObjectUrls(attachments)

    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first')
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second')
  })
})
