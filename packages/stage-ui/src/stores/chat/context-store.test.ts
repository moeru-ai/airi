import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useChatContextStore } from './context-store'

function createContextMessage(overrides: Partial<ContextMessage> = {}) {
  return {
    id: overrides.id ?? 'evt',
    contextId: overrides.contextId ?? 'ctx',
    strategy: overrides.strategy ?? ContextUpdateStrategy.ReplaceSelf,
    text: overrides.text ?? 'Context text',
    lane: overrides.lane,
    createdAt: overrides.createdAt ?? Date.now(),
    metadata: overrides.metadata ?? {
      source: {
        kind: 'plugin',
        id: 'instance-1',
        plugin: { id: 'minecraft-bot' },
      },
    },
  } as any
}

describe('useChatContextStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('groups contexts by source and applies replace/append semantics', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      id: 'evt-1',
      contextId: 'ctx-1',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: 'First state',
      createdAt: 10,
    }))
    store.ingestContextMessage(createContextMessage({
      id: 'evt-2',
      contextId: 'ctx-2',
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'Second state',
      createdAt: 20,
    }))

    const buckets = store.getContextBucketsSnapshot()

    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.sourceKey).toBe('minecraft-bot:instance-1')
    expect(buckets[0]?.entryCount).toBe(2)
    expect(buckets[0]?.latestCreatedAt).toBe(20)
    expect(buckets[0]?.messages.map(message => message.text)).toEqual(['First state', 'Second state'])
  })

  it('replaces only the matching source bucket', () => {
    const store = useChatContextStore()

    store.ingestContextMessage(createContextMessage({
      id: 'evt-1',
      contextId: 'ctx-1',
      text: 'Minecraft state',
    }))
    store.ingestContextMessage(createContextMessage({
      id: 'evt-2',
      contextId: 'ctx-2',
      text: 'Discord state',
      metadata: {
        source: {
          kind: 'plugin',
          id: 'discord-instance',
          plugin: { id: 'discord' },
        },
      },
    }))
    store.ingestContextMessage(createContextMessage({
      id: 'evt-3',
      contextId: 'ctx-3',
      text: 'Updated Minecraft state',
    }))

    const snapshot = store.getContextsSnapshot()

    expect(Object.keys(snapshot)).toEqual(['minecraft-bot:instance-1', 'discord:discord-instance'])
    expect(snapshot['minecraft-bot:instance-1']).toHaveLength(1)
    expect(snapshot['minecraft-bot:instance-1']?.[0]?.text).toBe('Updated Minecraft state')
    expect(snapshot['discord:discord-instance']?.[0]?.text).toBe('Discord state')
  })
})
