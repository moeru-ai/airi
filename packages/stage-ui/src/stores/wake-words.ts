import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { resolveWakeWords, validateWakeWords } from '../libs/voice/wake-words'
import { useAiriCardStore } from './modules/airi-card'

/** Pronunciation choices belong to this device library. Card import and export never include these choices. */
export const useWakeWordsStore = defineStore('wake-words', () => {
  const cards = useAiriCardStore()
  const owners = useLocalStorageManualReset<Record<string, string>>('settings/voice/pronunciation-owners', {})
  const catalog = computed(() => resolveWakeWords([...cards.cards].map(([characterId, card]) => ({ characterId, words: card.extensions.airi.wakeWords ?? [] })), owners.value))

  function chooseOwner(key: string, characterId: string) {
    const conflict = catalog.value.conflicts.find(conflict => conflict.key === key)
    if (!conflict?.candidates.some(candidate => candidate.characterId === characterId))
      throw new Error('Character does not own this pronunciation')
    owners.value = { ...owners.value, [key]: characterId }
  }

  /** Keyword tools return conflicts as data. The character decides how to explain them to the user. */
  async function setWords(characterId: string, value: unknown, model: { id: string, vocabulary: ReadonlySet<string> }) {
    const card = cards.getCard(characterId)
    if (!card)
      throw new Error('Character is unavailable')
    const wakeWords = validateWakeWords(value, model)
    await cards.updateCard(characterId, { ...card, extensions: { ...card.extensions, airi: { ...card.extensions.airi, wakeWords } } })
    return { status: 'saved' as const, conflicts: catalog.value.conflicts.filter(conflict => conflict.candidates.some(candidate => candidate.characterId === characterId)) }
  }

  return { catalog, chooseOwner, setWords }
})
