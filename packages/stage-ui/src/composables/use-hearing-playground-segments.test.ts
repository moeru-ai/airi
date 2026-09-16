import { describe, expect, it } from 'vitest'

import { useHearingPlaygroundSegments } from './use-hearing-playground-segments'

describe('hearing playground segments', () => {
  it('keeps empty audio and the next transcript in separate segments', () => {
    const playground = useHearingPlaygroundSegments()
    const emptyRecording = new Blob(['noise'], { type: 'audio/wav' })
    const speechRecording = new Blob(['speech'], { type: 'audio/wav' })

    const emptyMetadata = playground.startRecording(emptyRecording)
    playground.finishEmpty(emptyMetadata)

    const speechMetadata = playground.startRecording(speechRecording)
    playground.finishRecording(speechMetadata, 'Second sentence.')

    expect(playground.segments.value).toHaveLength(2)
    expect(playground.segments.value[0]).toMatchObject({
      recording: emptyRecording,
      status: 'empty',
      text: '',
    })
    expect(playground.segments.value[1]).toMatchObject({
      recording: speechRecording,
      status: 'complete',
      text: 'Second sentence.',
    })
  })

  it('updates each segment by identity when results finish out of order', () => {
    const playground = useHearingPlaygroundSegments()
    const firstMetadata = playground.startRecording(new Blob(['first']))
    const secondMetadata = playground.startRecording(new Blob(['second']))

    playground.finishRecording(secondMetadata, 'Second sentence.')
    playground.finishRecording(firstMetadata, 'First sentence.')

    expect(playground.segments.value.map(segment => segment.text)).toEqual([
      'First sentence.',
      'Second sentence.',
    ])
  })

  it('replaces a volatile streaming transcript when the provider corrects it', () => {
    // ROOT CAUSE:
    //
    // Apple Speech sends complete volatile snapshots that can revise earlier characters.
    // Appending each snapshot kept both the incorrect text and its correction.
    //
    // Before: "今天天气很号 今天天气很好"
    // After: "今天天气很好"
    const playground = useHearingPlaygroundSegments()

    playground.replaceStreamingText('今天天气很号')
    playground.replaceStreamingText('今天天气很好')

    expect(playground.current.value).toBe('今天天气很好')
  })

  it('clears streaming and completed transcripts when the playground resets', () => {
    const playground = useHearingPlaygroundSegments()
    const metadata = playground.startRecording(new Blob(['speech']))

    playground.finishRecording(metadata, 'First provider result.')
    playground.replaceStreamingText('Second provider partial result')
    playground.clear()

    expect(playground.current.value).toBe('')
    expect(playground.segments.value).toEqual([])
  })
})
