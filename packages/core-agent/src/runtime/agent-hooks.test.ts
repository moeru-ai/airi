import type { ChatStreamEventContext } from '../types/chat'

import { describe, expect, it, vi } from 'vitest'

import { createChatHooks } from './agent-hooks'

// Translation uses the same subscriptions and cleanup lifetime as speech hooks.
describe('translation hooks', () => {
  it('unsubscribes and clears translation listeners', async () => {
    const hooks = createChatHooks()
    const listener = vi.fn(async () => {})
    const context: ChatStreamEventContext = { sessionId: 'session', turnId: 'turn', contexts: {}, composedMessage: [], message: { role: 'user', content: 'hello' } }
    const unsubscribe = hooks.onTokenTranslation(listener)
    await hooks.emitTokenTranslationHooks('你好', context)
    unsubscribe()
    await hooks.emitTokenTranslationHooks('ignored', context)
    hooks.onTokenTranslation(listener)
    hooks.clearHooks()
    await hooks.emitTokenTranslationHooks('ignored', context)
    expect(listener).toHaveBeenCalledExactlyOnceWith('你好', context)
  })
})
