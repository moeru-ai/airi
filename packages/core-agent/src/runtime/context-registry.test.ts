import type { ContextMessage } from '../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it } from 'vitest'

import { createContextRegistry } from './context-registry'

type TestContextMessage = ContextMessage & { source?: string }

function createMetadata(pluginId: string, instanceId: string): NonNullable<ContextMessage['metadata']> {
  return {
    source: {
      id: instanceId,
      kind: 'plugin',
      plugin: {
        id: pluginId,
      },
    },
  }
}

function createContextMessage(overrides: Partial<TestContextMessage> = {}): TestContextMessage {
  const id = overrides.id ?? 'context-1'

  return {
    id,
    contextId: overrides.contextId ?? id,
    strategy: overrides.strategy ?? ContextUpdateStrategy.ReplaceSelf,
    text: overrides.text ?? 'context text',
    createdAt: overrides.createdAt ?? 1,
    ...overrides,
  }
}

/**
 * @example
 * const registry = createContextRegistry()
 * registry.ingest({ strategy: ContextUpdateStrategy.ReplaceSelf, text: 'now' })
 */
describe('createContextRegistry', () => {
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
      text: 'first reading',
    }))
    const secondResult = registry.ingest(createContextMessage({
      id: 'second',
      source: 'sensor',
      strategy: ContextUpdateStrategy.AppendSelf,
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
   * metadata.source.plugin.id + metadata.source.id becomes "plugin:instance".
   */
  it('resolves metadata source keys before source fallback and unknown fallback', () => {
    const registry = createContextRegistry()

    const pluginInstanceResult = registry.ingest(createContextMessage({
      id: 'with-instance',
      source: 'fallback-source',
      metadata: createMetadata('weather', 'station-1'),
    }))
    const pluginOnlyResult = registry.ingest(createContextMessage({
      id: 'plugin-only',
      metadata: createMetadata('weather', ''),
    }))
    const sourceResult = registry.ingest(createContextMessage({
      id: 'source-only',
      source: 'legacy-source',
    }))
    const unknownResult = registry.ingest(createContextMessage({
      id: 'unknown-source',
    }))

    expect(pluginInstanceResult?.sourceKey).toBe('weather:station-1')
    expect(pluginOnlyResult?.sourceKey).toBe('weather')
    expect(sourceResult?.sourceKey).toBe('legacy-source')
    expect(unknownResult?.sourceKey).toBe('unknown')
    expect(Object.keys(registry.snapshot())).toEqual([
      'weather:station-1',
      'weather',
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
      text: 'first toString bucket entry',
    }))
    const secondResult = registry.ingest(createContextMessage({
      id: 'second',
      source: 'toString',
      strategy: ContextUpdateStrategy.AppendSelf,
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
    expect(registry.activeContexts().sensor).toEqual([])
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
