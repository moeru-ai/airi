import { storeToRefs } from 'pinia'
import { computed, onScopeDispose } from 'vue'

import { KeywordListener } from '../libs/keyword-listener'
import { getKwsVocabulary, loadKwsModel } from '../libs/kws-model'
import { resolveWakeWordKeywords, supportedWakeWordKeywords } from '../services/wake-words'
import { useAiriCardStore } from '../stores/modules/airi-card'

export interface HearingCallingWordsOptions {
  workletUrl: string
  onCalled: (cardId: string) => Promise<void>
  onError: (error: unknown) => void
}

/** Loads the current cards' calling words and owns the KWS listener lifecycle. */
export function useHearingCallingWords(options: HearingCallingWordsOptions) {
  const { cards, wakeWordOwnership } = storeToRefs(useAiriCardStore())
  const active = computed(() => resolveWakeWordKeywords(cards.value, wakeWordOwnership.value))
  const callingWords = computed(() => active.value.keywords)
  let listener: KeywordListener | undefined
  let generation = 0

  function stop() {
    ++generation
    listener?.stop()
    listener = undefined
  }

  async function pause() {
    await listener?.pause()
  }

  async function resume() {
    await listener?.resume()
  }

  async function start(stream: MediaStream): Promise<'ready' | 'unconfigured' | 'stale'> {
    stop()
    const currentGeneration = generation
    if (callingWords.value.length === 0)
      return 'unconfigured'

    const model = await loadKwsModel()
    if (currentGeneration !== generation)
      return 'stale'

    const selected = active.value
    const keywords = supportedWakeWordKeywords(selected.keywords, getKwsVocabulary(model))
    if (keywords.length === 0)
      return 'unconfigured'

    const nextListener = new KeywordListener(model, options.workletUrl, (label) => {
      if (listener !== nextListener || currentGeneration !== generation)
        return
      const cardId = selected.targets.get(label)?.cardId
      if (!cardId) {
        if (listener === nextListener)
          void nextListener.resume().catch(options.onError)
        return
      }
      void Promise.resolve()
        .then(() => {
          if (listener === nextListener && currentGeneration === generation)
            return options.onCalled(cardId)
        })
        .catch(async (error) => {
          options.onError(error)
          if (listener === nextListener)
            await nextListener.resume().catch(options.onError)
        })
    }, options.onError)
    listener = nextListener
    try {
      await nextListener.start(stream, keywords)
    }
    catch (error) {
      if (listener === nextListener)
        listener = undefined
      nextListener.stop()
      throw error
    }
    if (currentGeneration !== generation) {
      nextListener.stop()
      return 'stale'
    }
    return 'ready'
  }

  onScopeDispose(stop)

  return { callingWords, start, stop, pause, resume }
}
