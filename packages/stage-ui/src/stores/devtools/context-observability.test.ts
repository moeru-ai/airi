import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useContextObservabilityStore } from './context-observability'

describe('useContextObservabilityStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('records lifecycle entries and broadcast timestamps', () => {
    const store = useContextObservabilityStore()

    store.recordLifecycle({
      phase: 'server-received',
      channel: 'server',
      sourceKey: 'minecraft-bot:instance-1',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      contextId: 'ctx-1',
      eventId: 'evt-1',
      textPreview: 'Gathering wood near spawn.',
    })
    store.recordLifecycle({
      phase: 'broadcast-received',
      channel: 'broadcast',
      sourceKey: 'minecraft-bot:instance-1',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      contextId: 'ctx-1',
      eventId: 'evt-1',
      textPreview: 'Gathering wood near spawn.',
    })

    expect(store.history).toHaveLength(2)
    expect(store.history[0]?.phase).toBe('broadcast-received')
    expect(store.lastBroadcastReceivedAt).toBeTypeOf('number')
  })

  it('captures the last prompt projection with formatted prompt text', () => {
    const store = useContextObservabilityStore()

    store.capturePromptProjection({
      sessionId: 'session-1',
      message: 'What is the bot doing?',
      contexts: {
        'minecraft-bot:instance-1': [
          {
            id: 'evt-1',
            contextId: 'ctx-1',
            strategy: ContextUpdateStrategy.ReplaceSelf,
            text: 'Bot is mining coal.',
            createdAt: 1,
          },
        ],
      } as any,
    })

    expect(store.lastPromptProjection?.sessionId).toBe('session-1')
    expect(store.lastPromptProjection?.promptText).toContain('minecraft-bot:instance-1')
    expect(store.lastPromptProjection?.promptText).toContain('Bot is mining coal.')
  })
})
