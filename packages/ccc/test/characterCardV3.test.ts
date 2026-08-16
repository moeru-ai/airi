import { describe, expect, it } from 'vitest'

import {
  exportToJSON,
  InvalidCharacterCardError,
  isInvalidCharacterCardError,
  parseCharacterCardV3,
} from '../src'

const completeCard = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'ReLU',
    description: 'A curious AI.',
    personality: 'Warm and precise.',
    scenario: 'A quiet observatory.',
    first_mes: 'Welcome, {{user}}.',
    mes_example: '<START>\n{{user}}: Hello\n{{char}}: Hi!',
    alternate_greetings: ['Good evening.'],
    group_only_greetings: ['Hello, everyone.'],
    character_version: '1.0.0',
    creator: 'AIRI',
    creator_notes: 'Created for codec coverage.',
    creator_notes_multilingual: {
      ja: 'コーデックテスト用です。',
    },
    system_prompt: 'Stay in character.',
    post_history_instructions: 'Answer the latest message.',
    tags: ['assistant'],
    source: ['https://example.com/relu'],
    creation_date: 1_700_000_000,
    modification_date: 1_700_000_100,
    assets: [
      {
        type: 'icon',
        uri: 'ccdefault:',
        name: 'main',
        ext: 'png',
        future_asset_field: 'preserved',
      },
    ],
    character_book: {
      name: 'Observatory',
      extensions: {
        vendor: 'airi',
      },
      entries: [
        {
          keys: ['comet'],
          content: 'The comet returns every 72 years.',
          extensions: {},
          enabled: true,
          insertion_order: 10,
          use_regex: false,
          id: 'comet-entry',
          future_entry_field: true,
        },
      ],
      future_book_field: 42,
    },
    extensions: {
      airi: {
        modules: {},
      },
    },
    future_data_field: {
      keep: true,
    },
  },
  future_envelope_field: 'preserved',
} as const

describe('character card V3 codec', () => {
  it('parses the complete CCv3 contract without discarding future fields', () => {
    const result = parseCharacterCardV3(completeCard)

    expect(result.compatibility).toBe('current')
    expect(result.card).toEqual(completeCard)
    expect(result.card.data.character_book?.entries[0]?.id).toBe('comet-entry')
    expect(result.card.data.character_book?.entries[0]?.use_regex).toBe(false)
  })

  it('parses JSON text through the same validation boundary', () => {
    const result = parseCharacterCardV3(JSON.stringify(completeCard))

    expect(result.card.data.name).toBe('ReLU')
    expect(result.compatibility).toBe('current')
  })

  it('accepts compatible newer documents and reports their compatibility', () => {
    const result = parseCharacterCardV3({
      ...completeCard,
      spec_version: '4.0',
    })

    expect(result.card.spec_version).toBe('4.0')
    expect(result.compatibility).toBe('newer')
  })

  it('accepts older documents with a V3 envelope and reports their compatibility', () => {
    const result = parseCharacterCardV3({
      ...completeCard,
      spec_version: '2.0',
    })

    expect(result.compatibility).toBe('older')
  })

  it('exports every standard CCv3 field represented by the domain card', () => {
    const exported = exportToJSON({
      name: completeCard.data.name,
      nickname: 'Re',
      version: completeCard.data.character_version,
      assets: [...completeCard.data.assets],
      characterBook: completeCard.data.character_book,
      creationDate: completeCard.data.creation_date,
      description: completeCard.data.description,
      greetings: [
        completeCard.data.first_mes,
        ...completeCard.data.alternate_greetings,
      ],
      greetingsGroupOnly: [...completeCard.data.group_only_greetings],
      modificationDate: completeCard.data.modification_date,
      notes: completeCard.data.creator_notes,
      notesMultilingual: completeCard.data.creator_notes_multilingual,
      personality: completeCard.data.personality,
      postHistoryInstructions: completeCard.data.post_history_instructions,
      scenario: completeCard.data.scenario,
      source: [...completeCard.data.source],
      systemPrompt: completeCard.data.system_prompt,
      tags: [...completeCard.data.tags],
      extensions: completeCard.data.extensions,
    })

    expect(exported.data.assets).toEqual(completeCard.data.assets)
    expect(exported.data.character_book).toEqual(completeCard.data.character_book)
    expect(exported.data.creation_date).toBe(completeCard.data.creation_date)
    expect(exported.data.modification_date).toBe(completeCard.data.modification_date)
    expect(exported.data.source).toEqual(completeCard.data.source)
  })

  it('reports one domain error for malformed JSON or invalid cards', () => {
    for (const source of [
      '{',
      {
        ...completeCard,
        spec: 'chara_card_v2',
      },
      {
        ...completeCard,
        data: {
          ...completeCard.data,
          character_book: {
            ...completeCard.data.character_book,
            entries: [{
              ...completeCard.data.character_book.entries[0],
              use_regex: undefined,
            }],
          },
        },
      },
    ]) {
      expect(() => parseCharacterCardV3(source)).toThrow(InvalidCharacterCardError)

      try {
        parseCharacterCardV3(source)
      }
      catch (error) {
        expect(isInvalidCharacterCardError(error)).toBe(true)
      }
    }
  })
})
