import type { PiniaActionEvent } from '@proj-airi/stage-shared/types/pinia-action-event'

import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'
import { createPinia, defineStore } from 'pinia'
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'

import { piniaPluginTracing } from './pinia-plugin-tracing'

describe('piniaPluginTracing over BroadcastChannel', () => {
  it('emits correlated start and completion events without action values', async () => {
    const observer = observeActionEvents(2)

    const pinia = createPinia()
    pinia.use(piniaPluginTracing)
    createApp({}).use(pinia)

    const useStore = defineStore('action-event-test', {
      actions: {
        async complete(secret: string) {
          return `returned:${secret}`
        },
      },
    })

    await useStore(pinia).complete('must-not-be-recorded')
    const events = await observer.events

    observer.close()
    expect(events).toHaveLength(2)
    expect(events.map(event => event.status)).toEqual(['started', 'completed'])
    expect(events[0]?.invocationId).toBe(events[1]?.invocationId)
    for (const event of events) {
      expect(event).toEqual(expect.objectContaining({
        actionName: 'complete',
        storeId: 'action-event-test',
      }))
    }
    expect(JSON.stringify(events)).not.toContain('must-not-be-recorded')
    expect(JSON.stringify(events)).not.toContain('returned:')
  })

  it('emits a failed event without changing the action error', async () => {
    const observer = observeActionEvents(2)

    const pinia = createPinia()
    pinia.use(piniaPluginTracing)
    createApp({}).use(pinia)

    const failure = new Error('provider unavailable')
    const useStore = defineStore('failed-action-test', {
      actions: {
        fail() {
          throw failure
        },
      },
    })

    expect(() => useStore(pinia).fail()).toThrow(failure)
    const events = await observer.events

    observer.close()
    expect(events.map(event => event.status)).toEqual(['started', 'failed'])
    expect(events[1]?.errorMessage).toBe('provider unavailable')
  })
})

function observeActionEvents(count: number) {
  const channel = new BroadcastChannel(piniaActionTracingChannelName)
  const captured: PiniaActionEvent[] = []
  const events = new Promise<PiniaActionEvent[]>((resolve) => {
    channel.addEventListener('message', (message: MessageEvent<PiniaActionEvent>) => {
      captured.push(message.data)
      if (captured.length === count)
        resolve(captured)
    })
  })

  return {
    close: () => channel.close(),
    events,
  }
}
