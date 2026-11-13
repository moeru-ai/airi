import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { useVoiceprintStore } from './voiceprint'

const voiceprint = { embedding: new Float32Array([1, 0]), seconds: 8 }
const storageKey = 'settings/voice/voiceprints'
const legacyStorageKey = 'settings/voice/voiceprint'

afterEach(() => {
  localStorage.clear()
})

function createStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useVoiceprintStore()
  return { store, dispose: () => disposePinia(pinia) }
}

describe('voiceprint store', () => {
  it('adds each enrollment as a new enabled voiceprint', () => {
    const { store, dispose } = createStore()

    const first = store.add(voiceprint, Date.now() + 1)
    const second = store.add({ embedding: new Float32Array([0, 1]), seconds: 6 }, Date.now() + 1)

    expect(store.records.map(record => record.id)).toEqual([first, second])
    expect(store.records.map(record => record.label)).toEqual(['', ''])
    expect(store.matching.map(item => item.record.id)).toEqual([first, second])
    dispose()
  })

  it('compares only the enabled voiceprints', () => {
    const { store, dispose } = createStore()
    const first = store.add(voiceprint, Date.now() + 1)!
    const second = store.add(voiceprint, Date.now() + 1)!

    store.setEnabled(first, false)

    expect(store.usable.map(item => item.record.id)).toEqual([first, second])
    expect(store.matching.map(item => item.record.id)).toEqual([second])
    dispose()
  })

  it('renames and deletes one voiceprint', () => {
    const { store, dispose } = createStore()
    const first = store.add(voiceprint, Date.now() + 1)!
    const second = store.add(voiceprint, Date.now() + 1)!

    store.rename(first, 'Office microphone ')
    store.remove(second)

    expect(store.records.map(record => record.label)).toEqual(['Office microphone '])
    dispose()
  })

  it('does not add the voiceprint of an enrollment that started before all voiceprints were deleted', () => {
    const { store, dispose } = createStore()
    const startedAt = Date.now() - 1
    store.removeAll()

    expect(store.add(voiceprint, startedAt)).toBeUndefined()

    expect(store.records).toEqual([])
    expect(localStorage.getItem(storageKey)).toBe('[]')
    dispose()
  })

  it('moves the voiceprint of an older version into the list as Default', () => {
    localStorage.setItem(legacyStorageKey, JSON.stringify({
      modelId: speakerModel.id,
      modelRevision: speakerModel.revision,
      source: 'input',
      embedding: [1, 0],
      seconds: 9,
      createdAt: 1_000,
    }))

    const { store, dispose } = createStore()

    expect(store.records).toHaveLength(1)
    expect(store.records[0]).toMatchObject({ label: 'Default', enabled: true, seconds: 9, createdAt: 1_000 })
    expect(store.matching).toHaveLength(1)
    expect(localStorage.getItem(legacyStorageKey)).toBeNull()
    dispose()
  })

  it('keeps an old record that does not match a voiceprint where it is', () => {
    localStorage.setItem(legacyStorageKey, JSON.stringify({ embedding: 'not a voiceprint' }))

    const { store, dispose } = createStore()

    expect(store.records).toEqual([])
    expect(localStorage.getItem(legacyStorageKey)).not.toBeNull()
    dispose()
  })
})
