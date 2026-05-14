import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { isReadonly, reactive } from 'vue'

import { useChatContextStore } from './context-store'

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
 * const store = useChatContextStore()
 * store.ingestContextMessage(contextMessage)
 */
describe('useChatContextStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * Ingesting append-self updates mirrors activeContexts and contextHistory from core registry.
   */
  it('keeps reactive mirrors aligned with the core registry after ingest', () => {
    const store = useChatContextStore()
    const firstMessage = createContextMessage({
      id: 'first',
      metadata: createMetadata('weather', 'station-1'),
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'sunny',
    })
    const secondMessage = createContextMessage({
      id: 'second',
      metadata: createMetadata('weather', 'station-1'),
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'windy',
    })

    const firstResult = store.ingestContextMessage(firstMessage)
    const secondResult = store.ingestContextMessage(secondMessage)

    expect(firstResult).toEqual({
      sourceKey: 'weather:station-1',
      mutation: 'append',
      entryCount: 1,
    })
    expect(secondResult).toEqual({
      sourceKey: 'weather:station-1',
      mutation: 'append',
      entryCount: 2,
    })
    expect(store.activeContexts).toEqual(store.getContextsSnapshot())
    expect(store.activeContexts['weather:station-1']?.map(message => message.text)).toEqual(['sunny', 'windy'])
    expect(store.contextHistory.map(message => message.sourceKey)).toEqual(['weather:station-1', 'weather:station-1'])
  })

  /**
   * @example
   * Vue reactive envelopes are unwrapped before they enter the core registry.
   */
  it('unwraps Vue reactive envelopes before ingesting through the core registry', () => {
    const store = useChatContextStore()
    const reactiveMessage = reactive(createContextMessage({
      id: 'reactive-message',
      metadata: createMetadata('weather', 'station-1'),
      text: 'reactive weather',
    }))

    const result = store.ingestContextMessage(reactiveMessage)

    expect(result).toEqual({
      sourceKey: 'weather:station-1',
      mutation: 'replace',
      entryCount: 1,
    })
    expect(store.getContextsSnapshot()['weather:station-1']?.[0]?.text).toBe('reactive weather')
  })

  /**
   * @example
   * Consumers can read mirrors but cannot mutate the registry source of truth through them.
   */
  it('exposes readonly mirrors that do not allow external writes to pollute registry state', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      id: 'stable',
      source: 'sensor',
      text: 'stable context',
    }))

    expect(isReadonly(store.activeContexts)).toBe(true)
    expect(isReadonly(store.contextHistory)).toBe(true)

    Reflect.set(store.activeContexts, 'external', [createContextMessage({
      id: 'external',
      source: 'external',
      text: 'external write',
    })])
    Reflect.set(store.contextHistory, '0', {
      ...createContextMessage({
        id: 'external-history',
        source: 'external',
        text: 'external history write',
      }),
      sourceKey: 'external',
    })

    expect(store.activeContexts.external).toBeUndefined()
    expect(store.contextHistory[0]?.id).toBe('stable')
    expect(store.getContextsSnapshot()).toEqual({
      sensor: [
        expect.objectContaining({
          id: 'stable',
          text: 'stable context',
        }),
      ],
    })
  })

  /**
   * @example
   * resetContexts() clears both Pinia mirrors and the backing registry snapshot.
   */
  it('clears reactive mirrors and the backing registry when reset', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      source: 'sensor',
      text: 'before reset',
    }))
    store.resetContexts()

    expect(store.activeContexts).toEqual({})
    expect(store.contextHistory).toEqual([])
    expect(store.getContextsSnapshot()).toEqual({})
  })

  /**
   * @example
   * getContextBucketsSnapshot() returns entryCount, latestCreatedAt, and cloned messages.
   */
  it('preserves context bucket snapshot fields and latestCreatedAt calculation', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      id: 'first',
      source: 'sensor',
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'early',
      createdAt: 10,
    }))
    store.ingestContextMessage(createContextMessage({
      id: 'second',
      source: 'sensor',
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'late',
      createdAt: 30,
    }))

    const bucket = store.getContextBucketsSnapshot().find(snapshot => snapshot.sourceKey === 'sensor')

    expect(bucket).toBeDefined()
    if (!bucket)
      throw new Error('Expected sensor context bucket to exist')

    expect(bucket.sourceKey).toBe('sensor')
    expect(bucket.entryCount).toBe(2)
    expect(bucket.latestCreatedAt).toBe(30)
    expect(bucket.messages.map(message => message.text)).toEqual(['early', 'late'])
  })

  /**
   * @example
   * Mutating bucket snapshot messages never mutates the core registry.
   */
  it('keeps bucket snapshot message mutation isolated from the core registry', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      source: 'sensor',
      text: 'original bucket text',
    }))

    const bucket = store.getContextBucketsSnapshot().find(snapshot => snapshot.sourceKey === 'sensor')

    expect(bucket).toBeDefined()
    if (!bucket)
      throw new Error('Expected sensor context bucket to exist')

    const message = bucket.messages[0]
    expect(message).toBeDefined()
    if (!message)
      throw new Error('Expected sensor context message to exist')

    message.text = 'mutated bucket snapshot'

    expect(store.getContextsSnapshot().sensor?.[0]?.text).toBe('original bucket text')
  })
})
