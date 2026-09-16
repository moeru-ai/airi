import type { Conversation } from '@proj-airi/core-agent'

import type { AiriCard } from '../../types/airiCard'

import { describe, expect, it, vi } from 'vitest'

import {
  compileCharacterCardConversation,
  compileCharacterCardGreeting,
  compileCharacterCardMessages,
  compileCharacterCardSystemPrompt,
} from './runtime'

describe('character card runtime compiler', () => {
  it('compiles stable character fields without resolving send-time macros', async () => {
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

    const [systemMessage] = await compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
    ], { userName: 'Mira' })

    expect(systemMessage?.content).toContain('You are Stargazer. Help Mira.')
  })

  it('projects examples and post-history instructions without mutating session history', async () => {
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

    const result = await compileCharacterCardMessages(card, history, { userName: 'Mira' })

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

  it('expands only card-owned additions when the stored system prompt cannot be replaced', async () => {
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

    const [systemMessage] = await compileCharacterCardMessages(card, [
      { role: 'system', content: 'External policy keeps {{user}} literal.' },
    ], { userName: 'Mira' })

    expect(systemMessage?.content).toBe('External policy keeps {{user}} literal.\n\nLore for Mira.')
  })

  it('matches, orders, and positions Lorebook entries from recent chat history', async () => {
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

    const result = await compileCharacterCardMessages(card, [
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

  it('supports constants, selective keys, exclusions, and invalid regex safety', async () => {
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

    const [systemMessage] = await compileCharacterCardMessages(card, [
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
  it('ignores constant when Lorebook regex mode is enabled', async () => {
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

    const [systemMessage] = await compileCharacterCardMessages(card, [
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
  it('preserves insertion order for Lorebook entries at the same depth', async () => {
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

    const result = await compileCharacterCardMessages(card, [
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

  it('supports recursive hidden keys and deterministic macro dependencies', async () => {
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

    const [systemMessage] = await compileCharacterCardMessages(card, [
      { role: 'system', content: compileCharacterCardSystemPrompt(card) },
    ], { random: () => 0 })

    expect(systemMessage?.content).toContain('cba A 1')
    expect(systemMessage?.content).toContain('Visible seed.')
    expect(systemMessage?.content).toContain('Recursively activated.')
    expect(systemMessage?.content).not.toContain('hidden note')
    expect(systemMessage?.content).not.toContain('another note')
    expect(systemMessage?.content).not.toContain('hidden_key')
  })

  it('compiles only individual greetings and uses the selected index', async () => {
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

describe('character policy on portable conversations', () => {
  it('retains native Responses continuation and media while adding character instructions', async () => {
    const card = createCard({ postHistoryInstructions: 'Reply as {{char}}.' })
    const conversation: Conversation = {
      turns: [
        { id: 'image', type: 'user', content: [{ type: 'image', url: 'data:image/png;base64,fixture' }] },
        {
          id: 'answer',
          type: 'assistant',
          status: 'completed',
          rounds: [{
            id: 'round',
            content: [{ type: 'text', text: 'An image.' }],
            toolInvocations: [],
            projectionIssues: [],
            continuation: { scope: 'same-provider', protocol: 'responses', data: [] },
          }],
        },
      ],
    }
    const before = structuredClone(conversation)
    const result = await compileCharacterCardConversation(card, conversation)
    expect(result.turns.find(turn => turn.id === 'image')).toBe(conversation.turns[0])
    expect(result.turns.find(turn => turn.id === 'answer')).toBe(conversation.turns[1])
    expect(result.turns.at(-1)).toMatchObject({ type: 'system', content: [{ type: 'text', text: `Reply as ${card.name}.` }] })
    expect(conversation).toEqual(before)
  })
})

describe('character card review regressions', () => {
  it('keeps equal-depth order and anchors against authored history', async () => {
    const card = createCard({ characterBook: { extensions: {}, entries: [
      loreEntry({ constant: true, insertion_order: 1, content: '@@role assistant\n@@depth 1\nFirst' }),
      loreEntry({ constant: true, insertion_order: 2, content: '@@depth 1\nSecond' }),
      loreEntry({ constant: true, insertion_order: 3, content: '@@depth 2\nEarlier' }),
    ] } })
    card.extensions.airi.modules.artistry = undefined
    expect((await compileCharacterCardMessages(card, [{ role: 'user', content: 'old' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'latest' }])).map(message => message.content)).toEqual(['old', 'Earlier', 'answer', 'First', 'Second', 'latest'])
  })

  it('does not scan history when scan depth is zero', async () => {
    const card = createCard({ characterBook: { extensions: {}, scan_depth: 0, entries: [loreEntry({ keys: ['comet'], content: 'matched' })] } })
    card.extensions.airi.modules.artistry = undefined
    expect(await compileCharacterCardMessages(card, [{ role: 'user', content: 'comet' }])).toEqual([{ role: 'user', content: 'comet' }])
  })

  it('uses locale-neutral matching and merges regex case flags', async () => {
    const card = createCard({ characterBook: { extensions: {}, entries: [
      loreEntry({ keys: ['i'], content: '@@depth 0\nplain' }),
      loreEntry({ keys: ['/comet/m'], use_regex: true, content: '@@depth 0\nregex' }),
    ] } })
    card.extensions.airi.modules.artistry = undefined
    expect((await compileCharacterCardMessages(card, [{ role: 'user', content: 'I COMET' }])).map(message => message.content)).toEqual(['I COMET', 'plain', 'regex'])
  })

  it('expands legacy user names and inserts the card depth prompt', async () => {
    const card = createCard({ greetings: ['Hello <USER>'] })
    card.extensions.depth_prompt = { depth: 1, role: 'system', prompt: 'Help <user>' }
    card.extensions.airi.modules.artistry = undefined
    expect(compileCharacterCardGreeting(card, { userName: 'Mira' })).toBe('Hello Mira')
    card.extensions.airi.modules.artistry = undefined
    expect(await compileCharacterCardMessages(card, [{ role: 'user', content: 'question' }], { userName: 'Mira' })).toEqual([{ role: 'system', content: 'Help Mira' }, { role: 'user', content: 'question' }])
  })
})

it('terminates pathological imported regex without blocking the renderer', async () => {
  const card = createCard({ characterBook: { extensions: {}, entries: [loreEntry({ keys: ['^(a+)+$'], use_regex: true, content: 'unsafe' })] } })
  const result = compileCharacterCardMessages(card, [{ role: 'user', content: `${'a'.repeat(80)}!` }])
  await expect(result).rejects.toThrow('Lorebook regex matching timed out')
  card.characterBook!.entries[0].keys = ['safe']
  await expect(compileCharacterCardMessages(card, [{ role: 'user', content: 'safe' }])).resolves.toBeDefined()
})

it('inserts names containing replacement tokens literally', () => {
  const card = createCard({ name: '$&', greetings: ['Hello {{char}} and {{user}}.'] })
  expect(compileCharacterCardGreeting(card, { userName: '$\'' })).toBe('Hello $& and $\'.')
})

it('matches valid regex siblings even when an imported key is malformed', async () => {
  const card = createCard({ characterBook: { extensions: {}, entries: [loreEntry({ keys: ['[', 'comet'], use_regex: true, content: 'Matched comet' })] } })
  const result = await compileCharacterCardMessages(card, [{ role: 'user', content: 'comet' }])
  expect(JSON.stringify(result)).toContain('Matched comet')
})

it('keeps before-char lore after the main system prompt', async () => {
  const card = createCard({ systemPrompt: 'Main policy.', description: 'Character definition.', characterBook: { extensions: {}, entries: [loreEntry({ constant: true, position: 'before_char', content: 'Before definition.' })] } })
  const result = await compileCharacterCardMessages(card, [{ role: 'system', content: compileCharacterCardSystemPrompt(card) }])
  expect(result[0]?.content).toContain('Main policy.\n\nBefore definition.\n\nCharacter definition.')
})

it('scans authored text without timestamp or side-channel context matches', async () => {
  const card = createCard({ characterBook: { extensions: {}, entries: [
    loreEntry({ keys: ['^show'], use_regex: true, content: 'Authored match.' }),
    loreEntry({ keys: ['secret-context'], content: 'Context-only match.' }),
  ] } })
  const conversation: Conversation = { turns: [{ id: 'authored', type: 'user', content: [
    { type: 'text', text: '[2026-09-16] show a comet' },
    { type: 'runtime-context', entries: [{ source: 'account', text: 'secret-context' }] },
  ] }] }
  const result = await compileCharacterCardConversation(card, conversation, { lorebookMessages: [{ role: 'user', content: 'show a comet' }] })
  expect(JSON.stringify(result)).toContain('Authored match.')
  expect(JSON.stringify(result)).not.toContain('Context-only match.')
  expect(result.turns).toContain(conversation.turns[0])
})

it('reuses one real Worker for all regex checks in a compilation', async () => {
  const NativeWorker = globalThis.Worker
  let created = 0
  vi.stubGlobal('Worker', class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options)
      created += 1
    }
  })
  try {
    const card = createCard({ characterBook: { extensions: {}, entries: Array.from({ length: 40 }, (_, index) => loreEntry({
      keys: ['^show'],
      use_regex: true,
      selective: true,
      secondary_keys: ['comet'],
      content: `Lore ${index}.`,
    })) } })
    const result = await compileCharacterCardMessages(card, [{ role: 'user', content: 'show a comet' }])
    expect(JSON.stringify(result)).toContain('Lore 39.')
    expect(created).toBe(1)
  }
  finally {
    vi.unstubAllGlobals()
  }
})

it('preserves macro-looking names without interpreting inserted text again', async () => {
  const card = createCard({
    name: '{{user}} {{reverse:abc}}',
    greetings: ['{{char}} / {{user}} / <bot> / <user> / {{reverse:abc}}'],
    systemPrompt: '{{char}} / {{user}} / {{reverse:abc}}',
  })
  const userName = '{{roll:d6}} {{comment:keep}}'
  expect(compileCharacterCardGreeting(card, { userName })).toBe(`${card.name} / ${userName} / ${card.name} / ${userName} / cba`)
  const result = await compileCharacterCardMessages(card, [{ role: 'system', content: compileCharacterCardSystemPrompt(card) }], { userName })
  expect(result[0]?.content).toContain(`${card.name} / ${userName} / cba`)
})
