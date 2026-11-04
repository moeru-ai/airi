import type { VrmMotionRecord, VrmMotionStore } from './vrm-motions.repo'

import { describe, expect, it } from 'vitest'

import { createVrmMotionsRepo } from './vrm-motions.repo'

/** A localforage stand-in. Node has no IndexedDB for localforage to select. */
function createStore(records: Record<string, unknown> = {}): VrmMotionStore {
  return {
    getItem: async <T>(key: string) => (records[key] as T | undefined) ?? null,
    setItem: async <T>(key: string, value: T) => {
      records[key] = value
      return value
    },
    removeItem: async (key) => {
      delete records[key]
    },
    iterate: async <T, U>(callback: (value: T, key: string) => U) => {
      let result: U | undefined
      for (const [key, value] of Object.entries(records))
        result = callback(value as T, key)
      return result as U
    },
  }
}

function motion(id: string, importedAt: number): VrmMotionRecord {
  return { id, name: id, description: `${id} motion`, file: new File(['vrma'], `${id}.vrma`), importedAt }
}

describe('vrmMotionsRepo', () => {
  it('lists only motions, oldest import first', async () => {
    const repo = createVrmMotionsRepo(createStore({ 'display-model-a': { name: 'model' } }))

    await repo.save(motion('vrm-motion-b', 2))
    await repo.save(motion('vrm-motion-a', 1))

    expect((await repo.list()).map(entry => entry.id)).toEqual(['vrm-motion-a', 'vrm-motion-b'])
  })

  it('keeps the file bytes and removes a motion', async () => {
    const repo = createVrmMotionsRepo(createStore())
    await repo.save(motion('vrm-motion-a', 1))

    expect(await (await repo.list())[0].file.text()).toBe('vrma')

    await repo.remove('vrm-motion-a')
    expect(await repo.list()).toEqual([])
  })
})
