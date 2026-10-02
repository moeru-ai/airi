import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'

import { useStreamingTranscriptionInput } from './use-streaming-transcription-input'

describe('streaming transcription input', () => {
  it('replaces provider corrections and clears only the owned suffix', () => {
    const input = shallowRef('manual prefix')
    const transcription = useStreamingTranscriptionInput(input)

    transcription.replace('今天天气很号')
    transcription.replace('今天天气很好')

    expect(input.value).toBe('manual prefix 今天天气很好')

    transcription.clear()

    expect(input.value).toBe('manual prefix')
  })

  it('keeps manual edits after the user changes the volatile suffix', () => {
    const input = shallowRef('manual prefix')
    const transcription = useStreamingTranscriptionInput(input)

    transcription.replace('provider draft')
    input.value = 'user replacement'
    transcription.replace('provider correction')
    transcription.clear()

    expect(input.value).toBe('user replacement')
  })

  it('commits the final correction as stable input', () => {
    const input = shallowRef('manual prefix')
    const transcription = useStreamingTranscriptionInput(input)

    transcription.replace('provider draft')

    expect(transcription.commit('provider final')).toBe(true)
    expect(input.value).toBe('manual prefix provider final')

    transcription.clear()

    expect(input.value).toBe('manual prefix provider final')
  })

  it('removes the provider draft when the final transcript is empty', () => {
    const input = shallowRef('manual prefix')
    const transcription = useStreamingTranscriptionInput(input)

    transcription.replace('provider draft')

    expect(transcription.commit('')).toBe(false)
    expect(input.value).toBe('manual prefix')
  })
})
