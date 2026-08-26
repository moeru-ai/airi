import { describe, expect, it } from 'vitest'

import {
  exportToJSON,
  InvalidCharacterCardError,
  isInvalidCharacterCardError,
  parseCharacterCardV3,
} from '../src'

const completeCard = {
  data: {
    alternate_greetings: ['Good evening.'],
    assets: [
      {
        ext: 'png',
        future_asset_field: 'preserved',
        name: 'main',
        type: 'icon',
        uri: 'ccdefault:',
      },
    ],
    character_book: {
      entries: [
        {
          content: 'The comet returns every 72 years.',
          enabled: true,
          extensions: {},
          future_entry_field: true,
          id: 'comet-entry',
          insertion_order: 10,
          keys: ['comet'],
          use_regex: false,
        },
      ],
      extensions: {
        vendor: 'airi',
      },
      future_book_field: 42,
      name: 'Observatory',
    },
    character_version: '1.0.0',
    creation_date: 1_700_000_000,
    creator: 'AIRI',
    creator_notes: 'Created for codec coverage.',
    creator_notes_multilingual: {
      ja: 'コーデックテスト用です。',
    },
    description: 'A curious AI.',
    extensions: {
      airi: {
        modules: {},
      },
    },
    first_mes: 'Welcome, {{user}}.',
    future_data_field: {
      keep: true,
    },
    group_only_greetings: ['Hello, everyone.'],
    mes_example: '<START>\n{{user}}: Hello\n{{char}}: Hi!',
    modification_date: 1_700_000_100,
    name: 'ReLU',
    personality: 'Warm and precise.',
    post_history_instructions: 'Answer the latest message.',
    scenario: 'A quiet observatory.',
    source: ['https://example.com/relu'],
    system_prompt: 'Stay in character.',
    tags: ['assistant'],
  },
  future_envelope_field: 'preserved',
  spec: 'chara_card_v3',
  spec_version: '3.0',
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
      assets: [...completeCard.data.assets],
      characterBook: completeCard.data.character_book,
      creationDate: completeCard.data.creation_date,
      description: completeCard.data.description,
      extensions: completeCard.data.extensions,
      greetings: [
        completeCard.data.first_mes,
        ...completeCard.data.alternate_greetings,
      ],
      greetingsGroupOnly: [...completeCard.data.group_only_greetings],
      modificationDate: completeCard.data.modification_date,
      name: completeCard.data.name,
      nickname: 'Re',
      notes: completeCard.data.creator_notes,
      notesMultilingual: completeCard.data.creator_notes_multilingual,
      personality: completeCard.data.personality,
      postHistoryInstructions: completeCard.data.post_history_instructions,
      scenario: completeCard.data.scenario,
      source: [...completeCard.data.source],
      systemPrompt: completeCard.data.system_prompt,
      tags: [...completeCard.data.tags],
      version: completeCard.data.character_version,
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
