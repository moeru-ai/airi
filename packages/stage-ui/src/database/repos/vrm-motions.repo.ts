import localforage from 'localforage'

/** A VRMA motion that the user imported, with the description that the LLM reads. */
export interface VrmMotionRecord {
  id: string
  name: string
  description: string
  file: File
  importedAt: number
}

/** The part of localforage that the repository uses. */
export interface VrmMotionStore {
  getItem: <T>(key: string) => Promise<T | null>
  setItem: <T>(key: string, value: T) => Promise<T>
  removeItem: (key: string) => Promise<void>
  iterate: <T, U>(callback: (value: T, key: string) => U) => Promise<U>
}

/** Key prefix of imported motions. Display models use `display-model-`, so the keys do not overlap. */
export const vrmMotionPrefix = 'vrm-motion-'

/** Device storage for imported VRMA motions. */
export function createVrmMotionsRepo(store: VrmMotionStore) {
  return {
    async list() {
      const motions: VrmMotionRecord[] = []
      await store.iterate<VrmMotionRecord, void>((value, key) => {
        if (key.startsWith(vrmMotionPrefix))
          motions.push(value)
      })
      return motions.sort((a, b) => a.importedAt - b.importedAt)
    },

    async save(motion: VrmMotionRecord) {
      await store.setItem(motion.id, motion)
    },

    async remove(id: string) {
      await store.removeItem(id)
    },
  }
}

export const vrmMotionsRepo = createVrmMotionsRepo(localforage)
