import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { SpeechPlayback } from './speech-playback'

function fakePlayer() {
  let idle: (() => void) | undefined
  const played: string[] = []
  const player = {
    play: vi.fn((audio: Buffer) => played.push(audio.toString())),
    stop: vi.fn(() => idle?.()),
    onIdle: (listener: () => void) => {
      idle = listener
    },
  }
  return { player, played, finish: () => idle?.() }
}

describe('speech playback', () => {
  it('plays segments one at a time in arrival order', () => {
    const { player, played, finish } = fakePlayer()
    const playback = new SpeechPlayback(player)

    playback.enqueue(Buffer.from('first'))
    playback.enqueue(Buffer.from('second'))
    expect(played).toEqual(['first'])

    finish()
    expect(played).toEqual(['first', 'second'])
  })

  it('drops queued segments on stop and plays later speech normally', () => {
    const { player, played } = fakePlayer()
    const playback = new SpeechPlayback(player)
    playback.enqueue(Buffer.from('first'))
    playback.enqueue(Buffer.from('stale'))

    playback.stop()
    playback.enqueue(Buffer.from('next turn'))

    expect(player.stop).toHaveBeenCalledOnce()
    expect(played).toEqual(['first', 'next turn'])
  })
})
