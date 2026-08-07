import type { AiriCard } from '../../types/airiCard'

import { describe, expect, it } from 'vitest'

import {
  compileCharacterCardGreeting,
  compileCharacterCardMessages,
  compileCharacterCardSystemPrompt,
} from './runtime'

describe('character card runtime compiler', () => {
  it('compiles stable character fields without resolving send-time macros', () => {
    const card = createCard({
      nickname: 'Stargazer',
      systemPrompt: 'You are {{char}}. Help {{user}}.',
      description: 'A patient field researcher.',
      personality: 'Curious and precise.',
      scenario: 'Inside an observatory.',
    })

    expect(compileCharacterCardSystemPrompt(card)).toBe([
      'You are {{char}}. Help {{user}}.',
      'A patient field researcher.',
      'Curious and precise.',
      'Inside an observatory.',
      'Use the image widget.',
    ].join('\n\n'))

    const [systemMessage] = compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
    ], { userName: 'Mira' })

    expect(systemMessage?.content).toContain('You are Stargazer. Help Mira.')
  })

  it('projects examples and post-history instructions without mutating session history', () => {
    const card = createCard({
      nickname: 'Nova',
      messageExample: [
        ['{{user}}: What did you find?', '{{char}}: A comet for {{user}}.'],
      ],
      postHistoryInstructions: '{{char}} answers the latest observation.',
    })
    const history = [
      { role: 'system' as const, content: compileCharacterCardSystemPrompt(card) },
      { role: 'user' as const, content: 'Show me the sky.' },
    ]

    const result = compileCharacterCardMessages(card, history, { userName: 'Mira' })

    expect(result).toEqual([
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
      { role: 'user', content: 'What did you find?' },
      { role: 'assistant', content: 'A comet for Mira.' },
      { role: 'user', content: 'Show me the sky.' },
      { role: 'system', content: 'Nova answers the latest observation.' },
    ])
    expect(history).toEqual([
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
      { role: 'user', content: 'Show me the sky.' },
    ])
  })

  it('expands only card-owned additions when the stored system prompt cannot be replaced', () => {
    const card = createCard({
      systemPrompt: 'Card prompt for {{user}}.',
      characterBook: {
        extensions: {},
        entries: [
          loreEntry({
            constant: true,
            content: 'Lore for {{user}}.',
          }),
        ],
      },
    })

    const [systemMessage] = compileCharacterCardMessages(card, [
      { role: 'system', content: 'External policy keeps {{user}} literal.' },
    ], { userName: 'Mira' })

    expect(systemMessage?.content).toBe('External policy keeps {{user}} literal.\n\nLore for Mira.')
  })

  it('matches, orders, and positions Lorebook entries from recent chat history', () => {
    const card = createCard({
      description: 'Base description.',
      characterBook: {
        scan_depth: 1,
        recursive_scanning: false,
        extensions: {},
        entries: [
          {
            keys: ['comet'],
            content: 'After the character.',
            extensions: {},
            enabled: true,
            insertion_order: 20,
            use_regex: false,
          },
          {
            keys: ['COMET'],
            content: 'Before the character.',
            extensions: {},
            enabled: true,
            insertion_order: 10,
            use_regex: false,
            position: 'before_char',
          },
          {
            keys: ['/^show.*comet$/i'],
            content: '\n  @@role assistant\n  @@depth 1\nA remembered discovery.',
            extensions: {},
            enabled: true,
            insertion_order: 30,
            use_regex: true,
          },
          {
            keys: ['old topic'],
            content: 'Must not match outside scan depth.',
            extensions: {},
            enabled: true,
            insertion_order: 40,
            use_regex: false,
          },
        ],
      },
    })
    const stablePrompt = compileCharacterCardSystemPrompt(card)

    const result = compileCharacterCardMessages(card, [
      { role: 'system', content: `Policy.\n${stablePrompt}\n\nTool guidance.` },
      { role: 'user', content: 'old topic' },
      { role: 'assistant', content: 'unrelated' },
      { role: 'user', content: 'Show a comet' },
    ])

    expect(result).toEqual([
      {
        role: 'system',
        content: [
          'Policy.',
          'Before the character.',
          '',
          'Base description.',
          '',
          'Use the image widget.',
          '',
          'After the character.',
          '',
          'Tool guidance.',
        ].join('\n'),
      },
      { role: 'user', content: 'old topic' },
      { role: 'assistant', content: 'unrelated' },
      { role: 'assistant', content: 'A remembered discovery.' },
      { role: 'user', content: 'Show a comet' },
    ])
  })

  it('supports constants, selective keys, exclusions, and invalid regex safety', () => {
    const card = createCard({
      characterBook: {
        extensions: {},
        entries: [
          loreEntry({
            constant: true,
            content: 'Always active.',
            insertion_order: 1,
          }),
          loreEntry({
            keys: ['forest'],
            secondary_keys: ['moon'],
            selective: true,
            content: 'Moonlit forest.',
            insertion_order: 2,
          }),
          loreEntry({
            keys: ['forest'],
            content: '@@exclude_keys fire\nSafe forest.',
            insertion_order: 3,
          }),
          loreEntry({
            keys: ['['],
            content: 'Invalid regex.',
            insertion_order: 4,
            use_regex: true,
          }),
          loreEntry({
            keys: [],
            content: '@@dont_activate\n@@activate\nExplicit activation wins.',
            insertion_order: 5,
          }),
        ],
      },
    })

    const [systemMessage] = compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
      { role: 'user', content: 'A moonlit forest fire.' },
    ])

    expect(systemMessage?.content).toContain('Always active.')
    expect(systemMessage?.content).toContain('Moonlit forest.')
    expect(systemMessage?.content).not.toContain('Safe forest.')
    expect(systemMessage?.content).not.toContain('Invalid regex.')
    expect(systemMessage?.content).toContain('Explicit activation wins.')
  })

  // https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#constant
  it('ignores constant when Lorebook regex mode is enabled', () => {
    const card = createCard({
      characterBook: {
        extensions: {},
        entries: [
          loreEntry({
            constant: true,
            content: 'Regex-independent constant.',
            keys: ['does-not-match'],
            use_regex: true,
          }),
        ],
      },
    })

    const [systemMessage] = compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
      { role: 'user', content: 'Unrelated conversation.' },
    ])

    expect(systemMessage?.content).not.toContain('Regex-independent constant.')
  })

  // https://github.com/moeru-ai/airi/pull/2119#discussion_r3656754244
  // ROOT CAUSE:
  //
  // Equal-depth entries were inserted one at a time at the same array index.
  // Every later splice therefore moved ahead of earlier insertion orders.
  it('preserves insertion order for Lorebook entries at the same depth', () => {
    const card = createCard({
      characterBook: {
        extensions: {},
        entries: [
          loreEntry({
            constant: true,
            content: '@@role system\n@@depth 1\nFirst depth entry.',
            insertion_order: 10,
          }),
          loreEntry({
            constant: true,
            content: '@@role system\n@@depth 1\nSecond depth entry.',
            insertion_order: 20,
          }),
        ],
      },
    })

    const result = compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
      { role: 'user', content: 'Latest user turn.' },
    ])

    expect(result.map(message => message.content)).toEqual([
      compileCharacterCardSystemPrompt(card),
      'First depth entry.',
      'Second depth entry.',
      'Latest user turn.',
    ])
  })

  it('supports recursive hidden keys and deterministic macro dependencies', () => {
    const card = createCard({
      systemPrompt: '{{// hidden note}}{{comment: another note}}{{reverse:abc}} {{random:A,B}} {{roll:d6}}',
      characterBook: {
        recursive_scanning: true,
        extensions: {},
        entries: [
          loreEntry({
            keys: ['unlock'],
            content: 'Recursively activated.',
            insertion_order: 2,
          }),
          loreEntry({
            constant: true,
            content: '{{hidden_key:unlock}}Visible seed.',
            insertion_order: 1,
          }),
        ],
      },
    })

    const [systemMessage] = compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
    ], { random: () => 0 })

    expect(systemMessage?.content).toContain('cba A 1')
    expect(systemMessage?.content).toContain('Visible seed.')
    expect(systemMessage?.content).toContain('Recursively activated.')
    expect(systemMessage?.content).not.toContain('hidden note')
    expect(systemMessage?.content).not.toContain('another note')
    expect(systemMessage?.content).not.toContain('hidden_key')
  })

  it('compiles only individual greetings and uses the selected index', () => {
    const card = createCard({
      nickname: 'Nova',
      greetings: ['Hello, {{user}}. I am {{char}}.', 'Welcome back, {{user}}.'],
      greetingsGroupOnly: ['Hello, everyone.'],
    })

    expect(compileCharacterCardGreeting(card, { userName: 'Mira' })).toBe('Hello, Mira. I am Nova.')
    expect(compileCharacterCardGreeting(card, { activeGreetingIndex: 1, userName: 'Mira' })).toBe('Welcome back, Mira.')
    expect(compileCharacterCardGreeting(createCard({ greetings: [] }))).toBeUndefined()
  })
})

function createCard(overrides: Partial<AiriCard> = {}): AiriCard {
  return {
    name: 'ReLU',
    version: '1.0.0',
    greetings: [],
    messageExample: [],
    extensions: {
      airi: {
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
          artistry: {
            widgetInstruction: 'Use the image widget.',
          },
        },
        agents: {},
      },
    },
    ...overrides,
  }
}

function loreEntry(overrides: Partial<NonNullable<AiriCard['characterBook']>['entries'][number]> = {}) {
  return {
    keys: [],
    content: '',
    extensions: {},
    enabled: true,
    insertion_order: 0,
    use_regex: false,
    ...overrides,
  }
}
