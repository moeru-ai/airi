import type { VrmMotionRecord } from '../database/repos/vrm-motions.repo'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useVrmMotionsStore } from './vrm-motions'

const records = vi.hoisted(() => new Map<string, VrmMotionRecord>())

vi.mock('../database/repos/vrm-motions.repo', () => ({
  vrmMotionPrefix: 'vrm-motion-',
  vrmMotionsRepo: {
    list: async () => [...records.values()],
    save: async (record: VrmMotionRecord) => {
      records.set(record.id, record)
    },
    remove: async (id: string) => {
      records.delete(id)
    },
  },
}))

describe('useVrmMotionsStore', () => {
  beforeEach(() => {
    records.clear()
    setActivePinia(createPinia())
  })

  it('starts with the bundled emotes', async () => {
    const store = useVrmMotionsStore()
    await store.load()

    expect(store.motionLibrary.emotes.map(emote => emote.id)).toContain('greeting')
    expect(store.motionLibrary.idles).toHaveLength(5)
  })

  it('adds an imported VRMA file as an emote with its description', async () => {
    const store = useVrmMotionsStore()

    const record = await store.importMotion(new File(['vrma'], 'Happy Jump.vrma'), { description: 'Jump with joy' })

    const emote = store.motionLibrary.emotes.find(entry => entry.id === record.id)
    expect(emote?.name).toBe('Happy Jump')
    expect(emote?.description).toBe('Jump with joy')
    expect(emote?.url.startsWith('blob:')).toBe(true)
    expect(records.has(record.id)).toBe(true)
  })

  it('rejects a file that is not VRMA', async () => {
    const store = useVrmMotionsStore()

    await expect(store.importMotion(new File(['x'], 'model.vrm'))).rejects.toThrow('Not a VRMA file')
  })

  it('keeps the name as the description when none is given, and updates both', async () => {
    const store = useVrmMotionsStore()
    const record = await store.importMotion(new File(['vrma'], 'wave.vrma'))

    expect(store.imported[0].description).toBe('wave')

    await store.updateMotion(record.id, { name: 'Big Wave', description: 'Wave with both arms' })

    expect(store.imported[0]).toMatchObject({ name: 'Big Wave', description: 'Wave with both arms' })
    expect(records.get(record.id)?.description).toBe('Wave with both arms')
  })

  it('removes an imported motion from the library and the storage', async () => {
    const store = useVrmMotionsStore()
    const record = await store.importMotion(new File(['vrma'], 'wave.vrma'))

    await store.removeMotion(record.id)

    expect(store.motionLibrary.emotes.some(emote => emote.id === record.id)).toBe(false)
    expect(records.size).toBe(0)
  })

  it('reads the motions of earlier sessions', async () => {
    records.set('vrm-motion-a', { id: 'vrm-motion-a', name: 'Bow', description: 'Bow deeply', file: new File(['vrma'], 'bow.vrma'), importedAt: 1 })
    const store = useVrmMotionsStore()

    await store.load()

    expect(store.motionLibrary.emotes.at(-1)?.name).toBe('Bow')
  })

  it('forwards a play request to the listeners', () => {
    const store = useVrmMotionsStore()
    const listener = vi.fn()
    store.onPlayRequest(listener)

    store.requestPlay('greeting')

    expect(listener).toHaveBeenCalledWith('greeting')
  })
})
