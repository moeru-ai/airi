import type { AiriCard } from '../../types/airiCard'

import { describe, expect, it } from 'vitest'

import { joinCard, splitCard } from './card-fields'

const card: AiriCard = {
  name: 'Luna',
  version: '1.0.0',
  description: 'A calm character',
  tags: ['calm', 'night'],
  greetings: ['Hello'],
  extensions: {
    'depth/prompt': { depth: 4 },
    'airi': {
      wakeWords: [],
      modules: {
        consciousness: { provider: 'openai', model: 'gpt' },
        vision: { provider: '', model: '' },
        speech: { provider: 'azure', model: 'neural', voice_id: 'aria', pitch: undefined },
        displayModelId: 'display-model-1',
      },
      agents: {},
    },
  },
}

describe('splitCard', () => {
  it('gives one part for each first-level key and each module', () => {
    expect(splitCard(card)).toEqual({
      '/name': 'Luna',
      '/version': '1.0.0',
      '/description': 'A calm character',
      '/tags': ['calm', 'night'],
      '/greetings': ['Hello'],
      '/extensions/depth~1prompt': { depth: 4 },
      '/extensions/airi/wakeWords': [],
      '/extensions/airi/agents': {},
      '/extensions/airi/modules/consciousness': { provider: 'openai', model: 'gpt' },
      '/extensions/airi/modules/vision': { provider: '', model: '' },
      '/extensions/airi/modules/speech': { provider: 'azure', model: 'neural', voice_id: 'aria' },
      '/extensions/airi/modules/displayModelId': 'display-model-1',
    })
  })
})

describe('joinCard', () => {
  it('restores the card that was split', () => {
    expect(joinCard(splitCard(card))).toEqual(JSON.parse(JSON.stringify(card)))
  })

  it('ignores keys that do not name a part', () => {
    const joined = joinCard({
      '/name': 'Luna',
      'name': 'no pointer',
      '/extensions': { airi: 'container' },
      '/extensions/airi/modules': { speech: 'container' },
      '/extensions/airi/modules/speech/provider': 'too deep',
      '/__proto__': { polluted: true },
      '/extensions/__proto__': { polluted: true },
    })

    expect(joined).toEqual({ name: 'Luna' })
    expect(Object.getPrototypeOf(joined)).toBe(Object.prototype)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })
})
