import { describe, expect, it, vi } from 'vitest'

import { postBroadcastChannelEvent } from './broadcast-channel'

describe('postBroadcastChannelEvent', () => {
  it('returns false and reports the error when the broadcast channel is closed', () => {
    const error = new DOMException('Channel is closed', 'InvalidStateError')
    const onError = vi.fn()

    const result = postBroadcastChannelEvent(() => {
      throw error
    }, { type: 'snapshot' }, onError)

    expect(result).toBe(false)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('returns true when the event is posted', () => {
    const post = vi.fn()

    const result = postBroadcastChannelEvent(post, { type: 'snapshot' })

    expect(result).toBe(true)
    expect(post).toHaveBeenCalledWith({ type: 'snapshot' })
  })
})
