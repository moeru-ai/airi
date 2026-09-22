import type { WireMessage } from '@proj-airi/server-sdk-shared/v2'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadCloudMessageAttachments, prepareCloudAttachment, uploadCloudAttachment } from './attachments'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cloud attachment preparation', () => {
  it('records the byte size and SHA-256 digest for the durable upload retry', async () => {
    const attachment = await prepareCloudAttachment('attachment-1', {
      data: btoa('test'),
      mimeType: 'image/png',
    })

    expect(attachment).toEqual({
      data: 'dGVzdA==',
      id: 'attachment-1',
      mimeType: 'image/png',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      size: 4,
    })
  })

  it('uploads bytes to the signed target before finalizing the attachment', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        attachment: { id: 'attachment-1', mimeType: 'image/png', size: 4 },
        upload: {
          headers: { 'content-type': 'image/png', 'x-amz-meta-sha256': 'hash' },
          url: 'https://objects.test/upload',
        },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        attachment: { id: 'attachment-1', mimeType: 'image/png', size: 4 },
      })))
    const objectFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await expect(uploadCloudAttachment({
      data: 'dGVzdA==',
      id: 'attachment-1',
      mimeType: 'image/png',
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      size: 4,
    }, { fetch: apiFetch, serverUrl: 'https://api.test' })).resolves.toBe('attachment-1')

    expect(objectFetch).toHaveBeenCalledWith('https://objects.test/upload', expect.objectContaining({ method: 'PUT' }))
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(String(apiFetch.mock.calls[1]?.[0])).toBe('https://api.test/api/v1/attachments/attachment-1/finalize')
  })

  it('downloads attachment bytes before local message hydration', async () => {
    const wire: WireMessage = {
      id: 'message-1',
      chatId: 'chat-1',
      senderId: 'owner-1',
      role: 'user',
      content: 'look',
      attachments: [{ id: 'attachment-1', mimeType: 'image/png', size: 4 }],
      seq: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({
      attachment: wire.attachments[0],
      url: 'https://objects.test/download',
    })))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new TextEncoder().encode('test')))

    await expect(downloadCloudMessageAttachments([wire], {
      fetch: apiFetch,
      serverUrl: 'https://api.test',
    })).resolves.toEqual(new Map([['attachment-1', 'data:image/png;base64,dGVzdA==']]))
  })
})
