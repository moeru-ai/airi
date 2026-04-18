import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSpeechRuntimeStore } from './speech-runtime'

describe('store speech runtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('forwards playback stop controls to the registered controller', () => {
    const store = useSpeechRuntimeStore()
    const stopByOwner = vi.fn()
    const stopAll = vi.fn()

    store.registerPlaybackController({
      stopByOwner,
      stopAll,
    })

    store.stopByOwner('peptutor-lesson', 'lesson-interrupt')
    store.stopAll('lesson-reset')

    expect(stopByOwner).toHaveBeenCalledWith('peptutor-lesson', 'lesson-interrupt')
    expect(stopAll).toHaveBeenCalledWith('lesson-reset')

    store.clearPlaybackController()
    store.stopByOwner('ignored-owner', 'ignored-reason')

    expect(stopByOwner).toHaveBeenCalledTimes(1)
  })
})
