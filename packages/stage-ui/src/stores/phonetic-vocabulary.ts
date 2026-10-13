import type { PhoneticVocabularyEntry } from '../libs/voice/phonetic-vocabulary'

import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

/**
 * Runtime domain vocabulary for post-ASR phonetic matching.
 *
 * Each source owns its entries, for example one imported pack or the terms that a model guessed for the current topic.
 * A source replaces its whole list. The state is in memory only, so each source writes again after a reload.
 * `entries` is a new array only when a source changes, so the voice plugin rebuilds its matcher only then.
 */
export const usePhoneticVocabularyStore = defineStore('phonetic-vocabulary', () => {
  const sources = shallowRef<ReadonlyMap<string, readonly PhoneticVocabularyEntry[]>>(new Map())
  const entries = computed(() => Object.freeze([...sources.value.values()].flat()))

  /** Replaces the entries of one source. An empty list removes the source. */
  function setSource(source: string, list: readonly PhoneticVocabularyEntry[]) {
    const next = new Map(sources.value)
    if (list.length)
      next.set(source, list)
    else
      next.delete(source)
    sources.value = next
  }

  return { entries, setSource }
})
