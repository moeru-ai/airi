import { expect, it } from 'vitest'

import { resolveWakeWords, validateWakeWords } from './wake-words'

it('pauses conflicting pronunciations until this device selects an owner and preserves other pronunciations', () => {
  const cards = [
    { characterId: 'alice', words: [{ text: 'AIRI', modelId: 'kws-vocabulary', pronunciations: [['a', 'ri'], ['ai', 'li']] }] },
    { characterId: 'bob', words: [{ text: 'Ari', modelId: 'kws-vocabulary', pronunciations: [['a', 'ri']] }] },
  ]
  const first = resolveWakeWords(cards, {})
  expect(first.active.map(item => item.tokens)).toEqual([['ai', 'li']])
  expect(first.conflicts).toHaveLength(1)
  const chosen = resolveWakeWords(cards, { [first.conflicts[0].key]: 'bob' })
  expect(chosen.active.map(item => item.characterId)).toEqual(['bob', 'alice'])
  expect(cards[0].words[0].pronunciations).toHaveLength(2)
  expect(resolveWakeWords(cards, {}).conflicts[0].owner).toBeUndefined()
})

it('validates every pronunciation against the external model vocabulary before accepting a card update', () => {
  const model = { id: 'kws-vocabulary', vocabulary: new Set(['a', 'ri']) }
  expect(validateWakeWords([{ text: 'AIRI', modelId: model.id, pronunciations: [['a', 'ri']] }], model)).toHaveLength(1)
  expect(() => validateWakeWords([{ text: 'AIRI', modelId: model.id, pronunciations: [['unknown']] }], model)).toThrow('vocabulary')
  expect(() => validateWakeWords([{ text: 'AIRI', modelId: 'another-model', pronunciations: [['a', 'ri']] }], model)).toThrow('vocabulary')
})
