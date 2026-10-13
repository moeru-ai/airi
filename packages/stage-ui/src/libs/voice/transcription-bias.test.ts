import { describe, expect, it, vi } from 'vitest'

import { collectConversationHotwords, rankConversationTerms, TranscriptionBiasList } from './transcription-bias'

describe('collectConversationHotwords', () => {
  it('collects names and specific terms but not ordinary words or sentence starts', () => {
    expect(collectConversationHotwords([
      { role: 'user', text: 'I built a store with Zustand and React.js. Ask Sulfur Cube fans.' },
    ])).toEqual(['Zustand', 'React.js', 'Sulfur Cube'])
  })

  it('collects code identifiers, acronyms, versions, and joined names', () => {
    expect(collectConversationHotwords([
      { role: 'assistant', text: 'Wrap it in useMemo, then run the ASR test on gpt-4o with C++ and C#.' },
    ])).toEqual(['useMemo', 'ASR', 'gpt-4o', 'C++', 'C#'])
  })

  it('collects quoted and bracketed spans in any script', () => {
    expect(collectConversationHotwords([
      { role: 'user', text: '我在《我的世界》里遇到了「硫方怪」，它不是普通的史莱姆。' },
    ])).toEqual(['我的世界', '硫方怪'])
  })

  it('ranks repeated and recent terms first, and ignores system messages', () => {
    expect(collectConversationHotwords([
      { role: 'system', text: 'You are AIRI.' },
      { role: 'user', text: 'Tell me about Vue and Pinia.' },
      { role: 'assistant', text: 'Pinia is a store for Vue. Vite and Pinia work well.' },
    ])).toEqual(['Pinia', 'Vue'])
  })

  it('accepts a sentence-start word only when it also appears inside a sentence', () => {
    expect(collectConversationHotwords([
      { role: 'user', text: 'Zustand is small. Today I tried Zustand. Sulfur Cube spawns here. I met the Sulfur Cube.' },
    ])).toEqual(['Zustand', 'Sulfur Cube'])
  })

  it('reports the score and the qualifying form of each term', () => {
    expect(rankConversationTerms([
      { role: 'user', text: 'Is 「硫方怪」 like a Sulfur Cube in ASR?' },
      { role: 'assistant', text: 'Yes, the Sulfur Cube is new.' },
    ])).toEqual([
      { phrase: 'Sulfur Cube', score: 3, form: 'name' },
      { phrase: '硫方怪', score: 1, form: 'quoted' },
      { phrase: 'ASR', score: 1, form: 'identifier' },
    ])
  })

  it('counts a quoted identifier once', () => {
    expect(rankConversationTerms([{ role: 'user', text: 'Try “ASR” with Whisper.' }])).toEqual([
      { phrase: 'ASR', score: 1, form: 'quoted' },
      { phrase: 'Whisper', score: 1, form: 'name' },
    ])
  })

  it('cuts the list to the limit', () => {
    expect(collectConversationHotwords([{ role: 'user', text: 'Compare ASR, TTS, and VAD.' }], 2)).toEqual(['ASR', 'TTS'])
  })
})

describe('transcriptionBiasList', () => {
  it('reads nothing before the first rebuild, then merges sources in order without duplicates', async () => {
    const list = new TranscriptionBiasList([
      { name: 'conversation', collect: async () => ['Zustand', 'Sulfur Cube'] },
      { name: 'memory', collect: async () => ['sulfur cube', 'Rin'] },
    ])

    expect(list.read('alice')).toBeUndefined()
    await list.rebuild('alice')
    expect(list.read('alice')).toEqual({ phrases: ['Zustand', 'Sulfur Cube', 'Rin'] })
    expect(list.read('bob')).toBeUndefined()
  })

  it('keeps the other sources when one fails, and reports the failed source', async () => {
    const onError = vi.fn()
    const list = new TranscriptionBiasList([
      { name: 'conversation', collect: async () => ['Zustand'] },
      { name: 'memory', collect: async () => Promise.reject(new Error('offline')) },
    ], { onError })

    await list.rebuild('alice')
    expect(list.read('alice')).toEqual({ phrases: ['Zustand'] })
    expect(onError).toHaveBeenCalledWith('memory', expect.any(Error))
  })

  it('keeps the other sources when one throws synchronously', async () => {
    const onError = vi.fn()
    const list = new TranscriptionBiasList([
      { name: 'memory', collect: () => { throw new Error('not ready') } },
      { name: 'conversation', collect: async () => ['Pinia'] },
    ], { onError })

    await list.rebuild('alice')
    expect(list.read('alice')).toEqual({ phrases: ['Pinia'] })
    expect(onError).toHaveBeenCalledWith('memory', expect.any(Error))
  })

  it('lets a newer rebuild win over a slower older one', async () => {
    const first = Promise.withResolvers<readonly string[]>()
    const collect = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(['Pinia'])
    const list = new TranscriptionBiasList([{ name: 'conversation', collect }])

    const older = list.rebuild('alice')
    await list.rebuild('alice')
    first.resolve(['Vue'])
    await older
    expect(list.read('alice')).toEqual({ phrases: ['Pinia'] })
  })

  it('forgets a session and ignores its rebuild in flight', async () => {
    const pending = Promise.withResolvers<readonly string[]>()
    const collect = vi.fn()
      .mockResolvedValueOnce(['Vue'])
      .mockReturnValueOnce(pending.promise)
    const list = new TranscriptionBiasList([{ name: 'conversation', collect }])

    await list.rebuild('alice')
    const inFlight = list.rebuild('alice')
    list.forget('alice')
    pending.resolve(['Pinia'])
    await inFlight
    expect(list.read('alice')).toBeUndefined()
  })

  it('caps the merged list at the limit', async () => {
    const list = new TranscriptionBiasList([{ name: 'conversation', collect: async () => ['A1', 'B2', 'C3'] }], { limit: 2 })

    await list.rebuild('alice')
    expect(list.read('alice')).toEqual({ phrases: ['A1', 'B2'] })
  })
})
