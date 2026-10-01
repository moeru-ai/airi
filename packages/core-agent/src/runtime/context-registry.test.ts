import type { ContextMessage } from '../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it } from 'vitest'

import { createContextRegistry } from './context-registry'

type TestContextMessage = ContextMessage & { source?: string }

function createMetadata(extensionId: string, moduleId: string): NonNullable<ContextMessage['metadata']> {
  return {
    source: {
      id: moduleId,
      extension: {
        id: extensionId,
      },
    },
  }
}

function createContextMessage(overrides: Partial<TestContextMessage> = {}): TestContextMessage {
  const id = overrides.id ?? 'context-1'

  return {
    id,
    contextId: overrides.contextId ?? 'sensor-reading',
    strategy: overrides.strategy ?? ContextUpdateStrategy.ReplaceSelf,
    text: overrides.text ?? 'context text',
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  }
}

/**
 * @example
 * const registry = createContextRegistry()
 * registry.ingest({ strategy: ContextUpdateStrategy.ReplaceSelf, text: 'now' })
 */
describe('createContextRegistry', () => {
  it('replaces one context slot without erasing another slot from the same writer', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ id: 'position-1', source: 'game', contextId: 'position', text: 'forest' }))
    registry.ingest(createContextMessage({ id: 'health-1', source: 'game', contextId: 'health', text: '20 HP' }))
    registry.ingest(createContextMessage({ id: 'position-2', source: 'game', contextId: 'position', text: 'village' }))

    expect(registry.snapshot().game?.map(message => [message.contextId, message.text])).toEqual([
      ['health', '20 HP'],
      ['position', 'village'],
    ])
  })

  it('keeps equal context ids isolated between writers', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ source: 'channel-a', contextId: 'status', text: 'A' }))
    registry.ingest(createContextMessage({ source: 'channel-b', contextId: 'status', text: 'B' }))

    expect(registry.snapshot()['channel-a']?.[0]?.text).toBe('A')
    expect(registry.snapshot()['channel-b']?.[0]?.text).toBe('B')
  })

  it('projects contexts for one reader without leaking another channel', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ source: 'discord-a', destinations: ['discord:channel:a'], text: 'private A' }))
    registry.ingest(createContextMessage({ source: 'discord-b', destinations: ['discord:channel:b'], text: 'private B' }))
    registry.ingest(createContextMessage({ source: 'clock', destinations: { all: true }, text: 'public time' }))

    const snapshot = registry.snapshot({ ids: ['discord:channel:a'] })
    expect(Object.keys(snapshot)).toEqual(['discord-a', 'clock'])
    expect(snapshot['discord-a']?.[0]?.text).toBe('private A')
    expect(registry.activeContexts()['discord-b']?.[0]?.text).toBe('private B')
  })

  it('applies destination exclusions before includes and filters lanes', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ source: 'secret', destinations: { include: ['character'], exclude: ['owner:private'] } }))
    registry.ingest(createContextMessage({ source: 'chat', destinations: ['character'], lane: 'chat' }))
    registry.ingest(createContextMessage({ source: 'game', destinations: ['character'], lane: 'game' }))
    registry.ingest(createContextMessage({ source: 'shared', destinations: ['character'] }))

    expect(Object.keys(registry.snapshot({ ids: ['character', 'owner:private'], lane: 'chat' }))).toEqual(['chat', 'shared'])
    expect(Object.keys(registry.snapshot({ ids: ['character'] }))).toEqual(['secret', 'chat', 'game', 'shared'])
  })

  it('lets a reader without a lane subscription read every lane it is addressed by', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ source: 'minecraft', lane: 'minecraft:status', destinations: { include: ['owner:private'] } }))
    registry.ingest(createContextMessage({ source: 'browser', lane: 'web:page', destinations: { include: ['owner:private'] } }))

    expect(Object.keys(registry.snapshot({ ids: ['owner:private'] }))).toEqual(['minecraft', 'browser'])
    expect(registry.snapshot({ ids: ['discord:channel:a'] })).toEqual({})
  })

  it('limits unspecified destinations to the writer and treats empty destinations as private', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ source: 'module-a' }))
    registry.ingest(createContextMessage({ source: 'module-b', destinations: [] }))
    registry.ingest(createContextMessage({ source: 'module-c', destinations: { exclude: ['other-reader'] } }))

    expect(registry.snapshot({ ids: ['owner:private'] })).toEqual({})
    expect(Object.keys(registry.snapshot({ ids: ['module-a'] }))).toEqual(['module-a'])
    expect(registry.snapshot({ ids: ['module-b'] })).toEqual({})
    expect(Object.keys(registry.snapshot({ ids: ['module-c'] }))).toEqual(['module-c'])
  })

  it('expires observations before reads and rejects already expired updates', () => {
    let now = 1_000
    const registry = createContextRegistry({ now: () => now, defaultTtlMs: 100 })
    registry.ingest(createContextMessage({ source: 'sensor', createdAt: now }))
    now = 1_100

    expect(registry.snapshot()).toEqual({})
    expect(registry.ingest(createContextMessage({ source: 'sensor', createdAt: 1_000 }))).toBeUndefined()
    expect(registry.activeContexts()).toEqual({})
    expect(registry.contextHistory()).toHaveLength(2)
  })

  it('bounds append slots independently of diagnostic history', () => {
    const registry = createContextRegistry({ maxEntriesPerSlot: 2 })
    for (const id of ['one', 'two', 'three'])
      registry.ingest(createContextMessage({ id, source: 'sensor', contextId: 'events', strategy: ContextUpdateStrategy.AppendSelf }))

    expect(registry.snapshot().sensor?.map(message => message.id)).toEqual(['two', 'three'])
    expect(registry.contextHistory()).toHaveLength(3)
  })

  // ROOT CAUSE:
  // Any contextId accepted append updates, so random slots bypassed the per-slot event limit.
  // Admission now requires an exact match in the host's fixed append-slot list.
  it('rejects append updates outside fixed event slots without changing active observations', () => {
    const registry = createContextRegistry()
    registry.ingest(createContextMessage({ id: 'stable', source: 'sensor', contextId: 'position', text: 'forest' }))

    const result = registry.ingest(createContextMessage({
      id: 'append-position',
      source: 'sensor',
      contextId: 'position',
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'village',
    }))

    expect(result).toBeUndefined()
    expect(registry.snapshot().sensor?.map(message => message.id)).toEqual(['stable'])
    expect(registry.contextHistory().map(message => message.id)).toEqual(['stable', 'append-position'])
  })

  it('uses an immutable copy of the configured append slots and keeps writer windows separate', () => {
    const appendContextIds = ['alerts']
    const registry = createContextRegistry({ appendContextIds, maxEntriesPerSlot: 2 })
    appendContextIds.push('arbitrary-slot')
    appendContextIds.splice(0, 1)
    for (const source of ['sensor-a', 'sensor-b']) {
      for (const id of ['one', 'two', 'three'])
        registry.ingest(createContextMessage({ id, source, contextId: 'alerts', strategy: ContextUpdateStrategy.AppendSelf }))
    }

    expect(registry.snapshot()['sensor-a']?.map(message => message.id)).toEqual(['two', 'three'])
    expect(registry.snapshot()['sensor-b']?.map(message => message.id)).toEqual(['two', 'three'])
    expect(registry.ingest(createContextMessage({ source: 'sensor-a', contextId: 'arbitrary-slot', strategy: ContextUpdateStrategy.AppendSelf }))).toBeUndefined()
    expect(registry.ingest(createContextMessage({ source: 'sensor-a', contextId: 'events', strategy: ContextUpdateStrategy.AppendSelf }))).toBeUndefined()
    expect(registry.ingest(createContextMessage({ source: 'sensor-a', contextId: 'alerts:other', strategy: ContextUpdateStrategy.AppendSelf }))).toBeUndefined()
  })

  it('disables append with an empty slot list while retaining replacement updates', () => {
    const registry = createContextRegistry({ appendContextIds: [] })

    expect(registry.ingest(createContextMessage({ source: 'sensor', contextId: 'events', strategy: ContextUpdateStrategy.AppendSelf }))).toBeUndefined()
    expect(registry.ingest(createContextMessage({ source: 'sensor', contextId: 'events' }))?.mutation).toBe('replace')
    expect(registry.snapshot().sensor).toHaveLength(1)
  })

  it('rejects an oversized replacement without deleting the previous slot', () => {
    const registry = createContextRegistry({ maxEntryTokens: 5, countTokens: text => text.length })
    registry.ingest(createContextMessage({ source: 'sensor', text: 'small' }))

    expect(registry.ingest(createContextMessage({ source: 'sensor', text: 'oversized' }))).toBeUndefined()
    expect(registry.snapshot().sensor?.[0]?.text).toBe('small')
  })

  // ROOT CAUSE:
  // Byte cost rejected short observations, especially multibyte text, despite the pool's token budget.
  // The default counter now uses one local o200k_base encoding for admission and retention.
  it.each([
    'The player is near the village, carrying wood and stone, with enough food to continue exploring safely.',
    '玩家正在村庄附近探索，生命值正常，背包里有木头、石头和食物。',
  ])('admits a short observation whose byte length exceeds its token budget: %s', (text) => {
    const registry = createContextRegistry()

    expect(new TextEncoder().encode(text).length).toBeGreaterThan(80)
    expect(registry.ingest(createContextMessage({ source: 'sensor', text }))?.mutation).toBe('replace')
    expect(registry.snapshot().sensor?.[0]?.text).toBe(text)
  })

  it('accepts exactly 80 tokens and preserves that slot when a replacement costs 81', () => {
    const registry = createContextRegistry()
    const text = `hello${' hello'.repeat(79)}`

    expect(registry.ingest(createContextMessage({ source: 'sensor', text }))?.mutation).toBe('replace')
    expect(registry.ingest(createContextMessage({ source: 'sensor', text: `${text} hello` }))).toBeUndefined()
    expect(registry.snapshot().sensor?.[0]?.text).toBe(text)
  })

  it('counts token marker text as ordinary untrusted observation content', () => {
    const registry = createContextRegistry()
    const text = 'Observed literal <|endoftext|> in a document'

    expect(registry.ingest(createContextMessage({ source: 'sensor', text }))?.mutation).toBe('replace')
    expect(registry.snapshot().sensor?.[0]?.text).toBe(text)
  })

  it('enforces a total token budget across many writers', () => {
    const registry = createContextRegistry({ maxTokens: 10, maxWriterTokens: 10, countTokens: text => text.length })
    for (let index = 0; index < 20; index++)
      registry.ingest(createContextMessage({ source: `writer-${index}`, text: 'four' }))

    const messages = Object.values(registry.snapshot()).flat()
    expect(messages.reduce((sum, message) => sum + message.text.length, 0)).toBeLessThanOrEqual(10)
    expect(messages).toHaveLength(2)
    expect(registry.contextHistory()).toHaveLength(20)
  })

  it('limits each writer without evicting another writer to admit an oversized slot', () => {
    const registry = createContextRegistry({ maxWriterTokens: 6, countTokens: text => text.length })
    registry.ingest(createContextMessage({ source: 'other', text: 'other' }))
    registry.ingest(createContextMessage({ source: 'sensor', contextId: 'one', text: 'four' }))
    registry.ingest(createContextMessage({ source: 'sensor', contextId: 'two', text: 'four' }))

    expect(registry.snapshot().sensor).toHaveLength(1)
    expect(registry.snapshot().other?.[0]?.text).toBe('other')
    expect(registry.ingest(createContextMessage({ source: 'sensor', text: 'toolong' }))).toBeUndefined()
    expect(registry.snapshot().other?.[0]?.text).toBe('other')
  })

  /**
   * @example
   * replace-self from the same source leaves one active entry and reports replace.
   */
  it('replaces the same source bucket for replace-self updates and returns entry count', () => {
    const registry = createContextRegistry()

    const firstResult = registry.ingest(createContextMessage({
      id: 'first',
      source: 'sensor',
      text: 'first reading',
    }))
    const secondResult = registry.ingest(createContextMessage({
      id: 'second',
      source: 'sensor',
      text: 'second reading',
    }))

    expect(firstResult).toEqual({
      sourceKey: 'sensor',
      mutation: 'replace',
      entryCount: 1,
    })
    expect(secondResult).toEqual({
      sourceKey: 'sensor',
      mutation: 'replace',
      entryCount: 1,
    })
    expect(registry.snapshot().sensor?.map(message => message.text)).toEqual(['second reading'])
    expect(registry.contextHistory().map(message => message.id)).toEqual(['first', 'second'])
  })

  /**
   * @example
   * append-self from the same source grows the active bucket and reports append.
   */
  it('appends to the same source bucket for append-self updates and returns the new entry count', () => {
    const registry = createContextRegistry()

    const firstResult = registry.ingest(createContextMessage({
      id: 'first',
      source: 'sensor',
      strategy: ContextUpdateStrategy.AppendSelf,
      contextId: 'events',
      text: 'first reading',
    }))
    const secondResult = registry.ingest(createContextMessage({
      id: 'second',
      source: 'sensor',
      strategy: ContextUpdateStrategy.AppendSelf,
      contextId: 'events',
      text: 'second reading',
    }))

    expect(firstResult).toEqual({
      sourceKey: 'sensor',
      mutation: 'append',
      entryCount: 1,
    })
    expect(secondResult).toEqual({
      sourceKey: 'sensor',
      mutation: 'append',
      entryCount: 2,
    })
    expect(registry.snapshot().sensor?.map(message => message.text)).toEqual(['first reading', 'second reading'])
  })

  /**
   * @example
   * metadata.source.extension.id + metadata.source.id becomes "extension:module".
   */
  it('resolves metadata source keys before source fallback and unknown fallback', () => {
    const registry = createContextRegistry()

    const extensionModuleResult = registry.ingest(createContextMessage({
      id: 'with-instance',
      source: 'fallback-source',
      metadata: createMetadata('weather', 'station-1'),
    }))
    const sourceResult = registry.ingest(createContextMessage({
      id: 'source-only',
      source: 'legacy-source',
    }))
    const unknownResult = registry.ingest(createContextMessage({
      id: 'unknown-source',
    }))

    expect(extensionModuleResult?.sourceKey).toBe('weather:station-1')
    expect(sourceResult?.sourceKey).toBe('legacy-source')
    expect(unknownResult?.sourceKey).toBe('unknown')
    expect(Object.keys(registry.snapshot())).toEqual([
      'weather:station-1',
      'legacy-source',
      'unknown',
    ])
  })

  /**
   * @example
   * createContextRegistry({ historyLimit: 2 }) keeps only the two newest history entries.
   */
  it('trims context history to the configured history limit', () => {
    const registry = createContextRegistry({ historyLimit: 2 })

    registry.ingest(createContextMessage({ id: 'first', source: 'sensor' }))
    registry.ingest(createContextMessage({ id: 'second', source: 'sensor' }))
    registry.ingest(createContextMessage({ id: 'third', source: 'sensor' }))

    expect(registry.contextHistory().map(message => message.id)).toEqual(['second', 'third'])
  })

  /**
   * @example
   * createContextRegistry() keeps the latest 400 history entries by default.
   */
  it('trims context history to the default 400 record history limit', () => {
    const registry = createContextRegistry()

    for (let index = 0; index < 401; index += 1) {
      registry.ingest(createContextMessage({
        id: `context-${index}`,
        source: 'sensor',
      }))
    }

    const historyIds = registry.contextHistory().map(message => message.id)
    expect(historyIds).toHaveLength(400)
    expect(historyIds[0]).toBe('context-1')
    expect(historyIds.at(-1)).toBe('context-400')
  })

  /**
   * @example
   * "__proto__" is a valid source key and cannot rewrite the snapshot prototype.
   */
  it('keeps __proto__ source keys as bucket data instead of mutating object prototypes', () => {
    const registry = createContextRegistry()

    const result = registry.ingest(createContextMessage({
      id: 'proto-source',
      source: '__proto__',
      text: 'safe proto bucket',
    }))
    const snapshot = registry.snapshot()

    expect(result).toEqual({
      sourceKey: '__proto__',
      mutation: 'replace',
      entryCount: 1,
    })
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype)
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(snapshot, '__proto__')?.value?.map((message: ContextMessage) => message.text)).toEqual(['safe proto bucket'])
  })

  /**
   * @example
   * "toString" is a valid source key and cannot collide with inherited methods.
   */
  it('keeps toString source keys as bucket data instead of colliding with inherited methods', () => {
    const registry = createContextRegistry()

    const firstResult = registry.ingest(createContextMessage({
      id: 'first',
      source: 'toString',
      strategy: ContextUpdateStrategy.AppendSelf,
      contextId: 'events',
      text: 'first toString bucket entry',
    }))
    const secondResult = registry.ingest(createContextMessage({
      id: 'second',
      source: 'toString',
      strategy: ContextUpdateStrategy.AppendSelf,
      contextId: 'events',
      text: 'second toString bucket entry',
    }))

    expect(firstResult?.entryCount).toBe(1)
    expect(secondResult).toEqual({
      sourceKey: 'toString',
      mutation: 'append',
      entryCount: 2,
    })
    expect(Object.getOwnPropertyDescriptor(registry.snapshot(), 'toString')?.value?.map((message: ContextMessage) => message.text)).toEqual([
      'first toString bucket entry',
      'second toString bucket entry',
    ])
  })

  /**
   * @example
   * Mutating a returned snapshot never mutates the registry internals.
   */
  it('returns cloned snapshots and active contexts so external mutation cannot pollute the registry', () => {
    const registry = createContextRegistry()

    registry.ingest(createContextMessage({
      source: 'sensor',
      text: 'original',
    }))

    const snapshot = registry.snapshot()
    const activeContexts = registry.activeContexts()
    const snapshotMessage = snapshot.sensor?.[0]
    const activeContextMessage = activeContexts.sensor?.[0]

    expect(snapshotMessage).toBeDefined()
    expect(activeContextMessage).toBeDefined()
    if (!snapshotMessage || !activeContextMessage)
      throw new Error('Expected cloned registry messages to exist')

    snapshotMessage.text = 'mutated snapshot'
    activeContextMessage.text = 'mutated active context'

    expect(registry.snapshot().sensor?.[0]?.text).toBe('original')
  })

  /**
   * @example
   * Unknown strategies return undefined but remain visible in history.
   */
  it('records unknown strategies in history without returning a mutation result', () => {
    const registry = createContextRegistry()
    const unsupportedStrategy = 'unknown-strategy' as ContextMessage['strategy']

    const result = registry.ingest(createContextMessage({
      id: 'unsupported',
      source: 'sensor',
      strategy: unsupportedStrategy,
    }))

    expect(result).toBeUndefined()
    expect(registry.contextHistory()).toEqual([
      expect.objectContaining({
        id: 'unsupported',
        sourceKey: 'sensor',
      }),
    ])
    expect(registry.activeContexts()).toEqual({})
  })

  /**
   * @example
   * Failed cloning leaves the registry exactly as it was before ingest.
   */
  it('keeps registry state unchanged when an envelope cannot be cloned', () => {
    const registry = createContextRegistry()

    registry.ingest(createContextMessage({
      id: 'stable',
      source: 'sensor',
      text: 'stable context',
    }))

    expect(() => registry.ingest(createContextMessage({
      id: 'uncloneable',
      source: 'broken-source',
      content: () => 'functions cannot be structured-cloned',
    }))).toThrow()
    expect(registry.snapshot()).toEqual({
      sensor: [
        expect.objectContaining({
          id: 'stable',
          text: 'stable context',
        }),
      ],
    })
    expect(registry.contextHistory().map(message => message.id)).toEqual(['stable'])
  })
})
