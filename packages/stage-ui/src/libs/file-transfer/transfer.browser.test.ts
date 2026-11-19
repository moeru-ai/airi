import { describe, expect, it } from 'vitest'

import { putToTarget } from './transfer'

// The Vitest server serves files and answers a PUT with an error status. That is enough to
// send real bytes through XMLHttpRequest, and the store tests cover the accepted upload.
function target() {
  return { url: `${location.origin}/__put-to-target-test`, method: 'PUT' as const, headers: { 'content-type': 'application/octet-stream' } }
}

describe('putToTarget', () => {
  it('reports the sent bytes and rejects a refused upload with its status', async () => {
    const blob = new Blob([new Uint8Array(4 * 1024 * 1024)])
    const sent: number[] = []

    await expect(putToTarget(blob, target(), { onProgress: bytes => sent.push(bytes) })).rejects.toThrow(/^Upload failed with status [45]\d\d$/)

    expect(sent.length).toBeGreaterThan(0)
    expect(sent.at(-1)).toBe(blob.size)
  })

  it('does not send when the signal is already aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('stopped before the upload')
    controller.abort(reason)
    const sent: number[] = []

    await expect(putToTarget(new Blob(['model']), target(), { signal: controller.signal, onProgress: bytes => sent.push(bytes) })).rejects.toBe(reason)

    expect(sent).toEqual([])
  })

  it('rejects with the abort reason when the signal aborts during the upload', async () => {
    const controller = new AbortController()
    const reason = new Error('account changed')
    const upload = putToTarget(new Blob([new Uint8Array(4 * 1024 * 1024)]), target(), { signal: controller.signal })
    controller.abort(reason)

    await expect(upload).rejects.toBe(reason)
  })
})
