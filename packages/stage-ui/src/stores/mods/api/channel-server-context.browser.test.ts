import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useModsServerChannelStore } from './channel-server'

describe('channel context slots', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    useModsServerChannelStore(pinia).dispose()
    disposePinia(pinia)
    localStorage.clear()
  })

  // ROOT CAUSE:
  // Random default contextId values created independent append windows instead of using an admitted event slot.
  // Undeclared append updates now use events. Explicit slots still require host admission.
  it('uses the fixed event slot for append updates without a declared slot', () => {
    const store = useModsServerChannelStore()
    store.sendContextUpdate({ text: 'first', strategy: ContextUpdateStrategy.AppendSelf })
    store.sendContextUpdate({ text: 'second', strategy: ContextUpdateStrategy.AppendSelf })

    const pending = store.getPendingSendSnapshot()
    expect(pending).toMatchObject([
      { type: 'context:update', data: { contextId: 'events', text: 'first' } },
      { type: 'context:update', data: { contextId: 'events', text: 'second' } },
    ])
  })

  it('preserves an explicit slot for host admission and keeps replacement identifiers independent', () => {
    const store = useModsServerChannelStore()
    store.sendContextUpdate({ text: 'custom event', strategy: ContextUpdateStrategy.AppendSelf, contextId: 'alerts' })
    store.sendContextUpdate({ text: 'state', strategy: ContextUpdateStrategy.ReplaceSelf, contextId: 'position' })

    expect(store.getPendingSendSnapshot()).toMatchObject([
      { type: 'context:update', data: { contextId: 'alerts' } },
      { type: 'context:update', data: { contextId: 'position' } },
    ])
  })

  it('fills undefined identifiers without replacing an explicit event id', () => {
    const store = useModsServerChannelStore()
    store.sendContextUpdate({ text: 'first', strategy: ContextUpdateStrategy.AppendSelf, id: undefined, contextId: undefined })
    store.sendContextUpdate({ text: 'second', strategy: ContextUpdateStrategy.AppendSelf, id: 'event-2' })

    expect(store.getPendingSendSnapshot()).toMatchObject([
      { data: { id: expect.any(String), contextId: 'events' } },
      { data: { id: 'event-2', contextId: 'events' } },
    ])
  })
})
