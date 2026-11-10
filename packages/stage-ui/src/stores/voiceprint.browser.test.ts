import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { useVoiceprintStore } from './voiceprint'

const voiceprint = { embedding: new Float32Array([1, 0]), seconds: 8 }

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
  it('saves the voiceprint of an enrollment that started after the last deletion', () => {
    const { store, dispose } = createStore()
    store.remove()

    expect(store.save(voiceprint, Date.now() + 1)).toBe(true)

    expect(store.record?.seconds).toBe(8)
    dispose()
  })

  it('does not save the voiceprint of an enrollment that started before a deletion', () => {
    const { store, dispose } = createStore()
    const startedAt = Date.now() - 1
    store.remove()

    expect(store.save(voiceprint, startedAt)).toBe(false)

    expect(store.record).toBeUndefined()
    expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
    dispose()
  })
})
