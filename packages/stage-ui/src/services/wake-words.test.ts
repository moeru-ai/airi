import type { AiriCard } from '../types/airiCard'

import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { resolveWakeWordKeywords, supportedWakeWordKeywords, validateWakeWordKeywords } from './wake-words'

function card(name: string, tokens: string[]): AiriCard {
  return {
    name,
    version: '1.0.0',
    extensions: {
      airi: {
        agents: {},
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
          wakeWords: { keywords: [{ label: name, matches: [{ tokens }] }] },
        },
      },
    },
  }
}

describe('wake words', () => {
  it('rejects unknown model tokens and duplicate pronunciations', () => {
    const vocabulary = new Set(['HELLO', 'WORLD'])
    expect(() => validateWakeWordKeywords([{ label: 'A', matches: [{ tokens: ['UNKNOWN'] }] }], vocabulary)).toThrow(/unknown/)
    expect(() => validateWakeWordKeywords([{ label: 'A', matches: [{ tokens: ['HELLO'] }, { tokens: ['HELLO'] }] }], vocabulary)).toThrow(/Duplicate/)
    expect(() => validateWakeWordKeywords([{ label: 'A', matches: [{ tokens: ['HELLO'], threshold: 1.5 }] }], vocabulary)).toThrow(/threshold/)
    expect(() => validateWakeWordKeywords([{ label: 'A', matches: [{ tokens: ['HELLO'] }, { tokens: ['WORLD'] }] }], vocabulary)).not.toThrow()
  })

  it('keeps a valid pronunciation when another imported reading is invalid', () => {
    const keywords = [{ label: 'A', matches: [{ tokens: ['HELLO'] }, { tokens: ['UNKNOWN'] }] }]
    expect(supportedWakeWordKeywords(keywords, new Set(['HELLO']))).toEqual([
      { label: 'A', matches: [{ tokens: ['HELLO'] }] },
    ])
  })

  // ROOT CAUSE:
  //
  // Character cards are reactive in Pinia. The active keyword projection kept
  // their nested match proxies, which Worker.postMessage cannot clone.
  // Copy the validated fields into plain keyword entries before sending them.
  it('makes active keywords transferable to the Sherpaw Worker', () => {
    const keywords = reactive([{ label: 'A', matches: [{ tokens: ['HELLO'] }] }])
    const active = supportedWakeWordKeywords(keywords, new Set(['HELLO']))

    expect(() => structuredClone(active)).not.toThrow()
  })

  it('pauses a shared pronunciation until this device chooses an owner', () => {
    const cards = new Map([
      ['a', card('A', ['HELLO'])],
      ['b', card('B', ['HELLO'])],
    ])

    const unresolved = resolveWakeWordKeywords(cards, {})
    expect(unresolved.keywords).toEqual([])
    expect(unresolved.conflicts).toEqual([{ sequence: 'HELLO', cardIds: ['a', 'b'] }])

    const resolved = resolveWakeWordKeywords(cards, { HELLO: 'b' })
    expect(resolved.keywords).toEqual([{ label: 'b:0', matches: [{ tokens: ['HELLO'] }] }])
    expect(resolved.targets.get('b:0')).toEqual({ cardId: 'b', keyword: 'B' })
    expect(resolved.conflicts).toEqual([{ sequence: 'HELLO', cardIds: ['a', 'b'], ownerCardId: 'b' }])
    expect(cards.get('a')?.extensions.airi.modules.wakeWords?.keywords[0]?.matches[0]?.tokens).toEqual(['HELLO'])
  })
})
