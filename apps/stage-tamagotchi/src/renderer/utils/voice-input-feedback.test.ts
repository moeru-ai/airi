import { describe, expect, it, vi } from 'vitest'

import { formatVoiceInputFailure, postVoiceInputCaption } from './voice-input-feedback'

describe('formatVoiceInputFailure', () => {
  it('includes the failed voice input stage and error message', () => {
    const message = formatVoiceInputFailure('send to chat', new Error('No active chat provider or model configured'))

    expect(message).toBe('Voice input failed to send to chat: No active chat provider or model configured')
  })

  it('falls back when the thrown value has no readable message', () => {
    const message = formatVoiceInputFailure('transcribe speech', undefined)

    expect(message).toBe('Voice input failed to transcribe speech.')
  })
})

describe('postVoiceInputCaption', () => {
  it('returns false and reports the error when the caption channel is closed', () => {
    const error = new DOMException('Channel is closed', 'InvalidStateError')
    const onError = vi.fn()

    const result = postVoiceInputCaption(() => {
      throw error
    }, { type: 'caption-speaker', text: 'hello' }, onError)

    expect(result).toBe(false)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('returns true when the caption is posted', () => {
    const post = vi.fn()

    const result = postVoiceInputCaption(post, { type: 'caption-speaker', text: 'hello' })

    expect(result).toBe(true)
    expect(post).toHaveBeenCalledWith({ type: 'caption-speaker', text: 'hello' })
  })
})
