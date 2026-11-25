import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatAssetsRepo } from '../../database/repos/chat-assets.repo'
import { storeChatAsset } from '../chat-assets'
import { TransferRequestError } from '../file-transfer/request-error'
import { putToTarget } from '../file-transfer/transfer'
import { downloadCloudAttachment, uploadCloudAttachment } from './attachments'

vi.mock('../file-transfer/transfer', async (importOriginal) => {
  const original = await importOriginal<typeof import('../file-transfer/transfer')>()
  return { ...original, putToTarget: vi.fn() }
})

const bytes = new TextEncoder().encode('test')
const image = { id: 'attachment-1', mimeType: 'image/png', size: 4 }
const sha256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

afterEach(async () => {
  vi.clearAllMocks()
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
    if (status === 412)
      vi.mocked(putToTarget).mockRejectedValueOnce(new TransferRequestError(status, 'Object exists', false))
    else
      vi.mocked(putToTarget).mockResolvedValueOnce(undefined)

    await expect(uploadCloudAttachment(image.id, ref, {
      apiFetch,
      serverUrl: 'https://api.test',
    })).resolves.toBe(image.id)

    expect(JSON.parse(apiFetch.mock.calls[0]?.[1].body)).toEqual({ ...image, sha256 })
    expect(putToTarget).toHaveBeenCalledWith(expect.any(Blob), { url: 'https://objects.test/upload', headers, method: 'PUT' })
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(String(apiFetch.mock.calls[1]?.[0])).toBe('https://api.test/api/v1/attachments/attachment-1/finalize')
  })

  it('rejects an invalid reservation before sending any bytes', async () => {
    const assetRef = await storeChatAsset(bytes, image.mimeType, 'session-1')
    const apiFetch = vi.fn(async () => Response.json({ attachment: image, upload: {} }))
    await expect(uploadCloudAttachment(image.id, assetRef, { apiFetch, serverUrl: 'https://api.test' })).rejects.toThrow()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(putToTarget).not.toHaveBeenCalled()
  })

  it('returns the downloaded image only if its checksum matches', async () => {
    const apiFetch = vi.fn(async () => Response.json({ attachment: image, sha256, url: 'https://objects.test/download' }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes))
    const options = { apiFetch, serverUrl: 'https://api.test' }
    await expect(downloadCloudAttachment(image, options)).resolves.toEqual(bytes)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(new Uint8Array(bytes.length)))
    await expect(downloadCloudAttachment(image, options)).rejects.toThrow('checksum')
  })

  it('includes a ThumbHash and the original dimensions when it reserves a valid image', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 120
    const context = canvas.getContext('2d')!
    context.fillStyle = '#6a65d6'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed'))))
    const ref = await storeChatAsset(new Uint8Array(await blob.arrayBuffer()), blob.type, 'session-1')
    const apiFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ attachment: image, upload: null }))

    await uploadCloudAttachment(image.id, ref, { apiFetch, serverUrl: 'https://api.test' })

    expect(JSON.parse(String(apiFetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      thumbnail: { width: 200, height: 120, hash: expect.stringMatching(/^[\w+/]+={0,2}$/) },
    })
  })
})
