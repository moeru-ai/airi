import type { WireMessage } from '@proj-airi/server-sdk-shared/v2'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatAssetsRepo } from '../../database/repos/chat-assets.repo'
import { readChatAsset, storeChatAsset } from '../chat-assets'
import { downloadCloudMessageAttachments, uploadCloudAttachment } from './attachments'

const bytes = new TextEncoder().encode('test')
const image = { id: 'attachment-1', mimeType: 'image/png', size: 4 }
const sha256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

afterEach(async () => {
  vi.restoreAllMocks()
  await chatAssetsRepo.releaseOwner('session-1')
})

describe('cloud attachments', () => {
  it.each([200, 412])('finalizes after a signed PUT returns HTTP %s', async (status) => {
    const ref = await storeChatAsset(bytes, image.mimeType, 'session-1')
    const headers = { 'content-type': 'image/png', 'if-none-match': '*', 'x-amz-checksum-sha256': 'hash' }
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        attachment: image,
        upload: { headers, url: 'https://objects.test/upload' },
      }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(image))
    const objectFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))

    await expect(uploadCloudAttachment({ id: image.id, ref }, {
      fetch: apiFetch,
      serverUrl: 'https://api.test',
    })).resolves.toBe(image.id)

    expect(JSON.parse(apiFetch.mock.calls[0]?.[1].body)).toEqual({ ...image, sha256 })
    expect(objectFetch).toHaveBeenCalledWith('https://objects.test/upload', expect.objectContaining({ headers, method: 'PUT' }))
    expect(objectFetch.mock.calls[0]?.[1]?.body).toBeInstanceOf(Blob)
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(String(apiFetch.mock.calls[1]?.[0])).toBe('https://api.test/api/v1/attachments/attachment-1/finalize')
  })

  it('stores the downloaded image under the receiving session', async () => {
    const wire: WireMessage = {
      id: 'message-1',
      chatId: 'chat-1',
      senderId: 'owner-1',
      role: 'user',
      content: 'look',
      attachments: [image],
      seq: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    const apiFetch = vi.fn(async () => Response.json({ url: 'https://objects.test/download' }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes))

    const refs = await downloadCloudMessageAttachments([wire], 'session-1', {
      fetch: apiFetch,
      serverUrl: 'https://api.test',
    })
    const ref = refs.get(image.id)!
    const asset = await readChatAsset(ref)

    expect(asset.mimeType).toBe(image.mimeType)
    expect(asset.owners).toContain('session-1')
    expect(new Uint8Array(await asset.blob.arrayBuffer())).toEqual(bytes)
  })
})
