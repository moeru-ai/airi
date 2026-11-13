import type { NormalAttachment } from './attachment'

import localforage from 'localforage'

import { afterEach, describe, expect, it } from 'vitest'

import { readNormalAttachment, saveNormalAttachment } from './attachment'

const fingerprints: string[] = []
const storage = localforage.createInstance({ name: 'airi-live2d-lighting', storeName: 'attachments' })
afterEach(async () => {
  await Promise.all(fingerprints.splice(0).map(key => storage.removeItem(key)))
})

function attachment(): NormalAttachment {
  const fingerprint = crypto.randomUUID()
  fingerprints.push(fingerprint)
  return {
    schema: 1,
    fingerprint,
    createdAt: Date.now(),
    generator: { model: 'test', revision: 'test', steps: 4, seed: 17, seconds: 1, device: 'test' },
    width: 1,
    height: 1,
    space: 'x-right-y-up-z-viewer',
    drawables: [{ id: 'face', reference: [0, 0, 1, 0, 0, 1], atlasUvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], texture: 0 }],
    neutral: new Blob(['neutral']),
    normal: new Blob(['first normal']),
    ownership: new Blob(['owner']),
    coverage: new Blob(['coverage']),
    coveredPixels: 1,
  }
}

describe('model normal attachments', () => {
  it('checks a missing model without creating data', async () => {
    const record = attachment()
    expect(await readNormalAttachment(record.fingerprint)).toBeUndefined()
    expect(await storage.getItem(record.fingerprint)).toBeNull()
  })

  it('persists the images and drawable reference together', async () => {
    const record = attachment()
    await saveNormalAttachment(record)
    const restored = await readNormalAttachment(record.fingerprint)
    expect(restored?.drawables).toEqual(record.drawables)
    expect(await restored?.normal.text()).toBe('first normal')
    expect(await restored?.ownership.text()).toBe('owner')
    expect(restored?.generator).toEqual(record.generator)
  })

  it('overwrites one model without changing another model', async () => {
    const first = attachment()
    const second = attachment()
    await saveNormalAttachment(first)
    await saveNormalAttachment(second)
    await saveNormalAttachment({ ...first, createdAt: first.createdAt + 1, normal: new Blob(['replacement']), ownership: new Blob(['replacement owner']) })
    const restored = await readNormalAttachment(first.fingerprint)
    expect(await restored?.normal.text()).toBe('replacement')
    expect(await restored?.ownership.text()).toBe('replacement owner')
    expect(restored?.createdAt).toBe(first.createdAt + 1)
    expect(await (await readNormalAttachment(second.fingerprint))?.normal.text()).toBe('first normal')
  })

  it('rejects an incompatible attachment instead of binding it', async () => {
    const record = attachment()
    await storage.setItem(record.fingerprint, { ...record, schema: 2 })
    await expect(readNormalAttachment(record.fingerprint)).rejects.toThrow('unsupported schema')
  })
})
