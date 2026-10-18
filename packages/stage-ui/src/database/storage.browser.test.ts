import localforage from 'localforage'

import { prefixStorage } from 'unstorage'
import { afterEach, describe, expect, it } from 'vitest'

import { listRawItems, storage } from './storage'

// Releases before the unstorage migration wrote these stores with localforage.
// Each test writes and removes only its own keys, because browser test files share one IndexedDB.
const previousDevice = localforage.createInstance({ name: 'localforage', storeName: 'keyvaluepairs' })
const previousChatAssets = localforage.createInstance({ name: 'airi-chat-assets', storeName: 'assets' })
const device = prefixStorage(storage, 'device')
const chatAssets = prefixStorage(storage, 'chat-assets')

/** One key of each record kind that the callers of the `device` mount write. */
const deviceKeys = [
  'display-model-V1StGXR8_Z5jdHi6B-myT',
  'transfer-task-display-model-V1StGXR8_Z5jdHi6B-myT',
  'bg-V1StGXR8_Z5jdHi6B-myT',
  'builtin:cozy-tea-corner',
  'image-journal-V1StGXR8_Z5jdHi6B-myT',
  'background-V1StGXR8_Z5jdHi6B-myT',
  'mmd-motion-V1StGXR8_Z5jdHi6B-myT',
]
const chatAssetKey = 'a'.repeat(64)

function recordFor(key: string) {
  return { id: key, file: new File([`bytes of ${key}`], `${key}.bin`, { type: 'application/octet-stream' }), importedAt: 1 }
}

afterEach(async () => {
  await Promise.all(deviceKeys.map(key => previousDevice.removeItem(key)))
  await previousChatAssets.removeItem(chatAssetKey)
})

describe('stores that localforage wrote', () => {
  it('reads every device record that an earlier release wrote, with the same bytes', async () => {
    for (const key of deviceKeys)
      await previousDevice.setItem(key, recordFor(key))

    for (const key of deviceKeys) {
      const stored = await device.getItemRaw<ReturnType<typeof recordFor>>(key)
      expect(stored?.id).toBe(key)
      expect(stored?.file).toBeInstanceOf(File)
      expect(await stored?.file.text()).toBe(`bytes of ${key}`)
    }
    const listed = await listRawItems<ReturnType<typeof recordFor>>(device, 'display-model-')
    expect(listed.map(([key]) => key)).toContain('display-model-V1StGXR8_Z5jdHi6B-myT')
    expect((await listRawItems(device, 'builtin:')).map(([key]) => key)).toContain('builtin:cozy-tea-corner')
  })

  it('writes and removes device records so that an earlier release reads the result', async () => {
    for (const key of deviceKeys)
      await device.setItemRaw(key, recordFor(key))

    for (const key of deviceKeys) {
      const stored = await previousDevice.getItem<ReturnType<typeof recordFor>>(key)
      expect(await stored?.file.text()).toBe(`bytes of ${key}`)
    }

    await device.removeItem(deviceKeys[0])
    expect(await previousDevice.getItem(deviceKeys[0])).toBeNull()
    expect(await previousDevice.getItem(deviceKeys[1])).not.toBeNull()
  })

  it('reads and writes chat assets in both directions', async () => {
    await previousChatAssets.setItem(chatAssetKey, { blob: new Blob(['image']), mimeType: 'image/png', owners: ['a'] })
    const stored = await chatAssets.getItemRaw<{ blob: Blob, owners: string[] }>(chatAssetKey)
    expect(await stored?.blob.text()).toBe('image')
    expect(stored?.owners).toEqual(['a'])

    await chatAssets.setItemRaw(chatAssetKey, { ...stored, owners: ['a', 'b'] })
    expect(await previousChatAssets.getItem(chatAssetKey)).toMatchObject({ mimeType: 'image/png', owners: ['a', 'b'] })
  })
})
