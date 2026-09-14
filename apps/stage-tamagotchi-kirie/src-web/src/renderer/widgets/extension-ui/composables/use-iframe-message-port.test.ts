import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { toWidgetsIframePostMessageRecord } from './use-iframe-message-port'

/**
 * @example
 * const payload = toWidgetsIframePostMessageRecord(reactive({ command: { requestId: 'req-1' } }))
 * expect(() => structuredClone(payload)).not.toThrow()
 */
describe('toWidgetsIframePostMessageRecord', () => {
  /**
   * @example
   * expect(structuredClone(toWidgetsIframePostMessageRecord(reactivePayload))).toMatchObject({ command: { requestId: 'req-1' } })
   */
  it('normalizes reactive nested payloads into structured-clone-safe records', () => {
    const payload = reactive({
      command: {
        requestId: 'req-1',
        action: 'start',
      },
      callback: () => 'not cloneable',
      nested: {
        createdAt: new Date('2026-04-28T00:00:00.000Z'),
      },
    })

    const normalized = toWidgetsIframePostMessageRecord(payload)

    expect(() => structuredClone(normalized)).not.toThrow()
    expect(normalized).toMatchObject({
      command: {
        requestId: 'req-1',
        action: 'start',
      },
      nested: {
        createdAt: '2026-04-28T00:00:00.000Z',
      },
    })
    expect(normalized).not.toHaveProperty('callback')
  })
})
