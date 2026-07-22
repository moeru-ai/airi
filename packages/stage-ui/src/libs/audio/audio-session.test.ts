import { describe, expect, it } from 'vitest'

import { requestAudioSessionType } from './audio-session'

type SessionType = 'ambient' | 'auto' | 'play-and-record' | 'playback' | 'transient' | 'transient-solo'

function navigatorWithSession(initial: SessionType = 'auto') {
  return { audioSession: { type: initial } }
}

describe('requestAudioSessionType', () => {
  // ROOT CAUSE:
  //
  // On iOS, Web Audio output runs in the ambient-like default audio session
  // category, which the hardware silent switch mutes — while <audio> elements
  // keep playing. TTS is played through a shared AudioContext, so with the
  // switch on, character speech was silent on Safari/PWA.
  //
  // We fixed this by promoting the audio session to 'playback' when the
  // playback AudioContext is created (and 'play-and-record' when microphone
  // capture starts), via the WebKit Audio Session API where available.
  //
  // https://github.com/moeru-ai/airi/issues/894
  it('promotes the session to playback so TTS survives the iOS mute switch (Issue #894)', () => {
    const nav = navigatorWithSession('auto')

    expect(requestAudioSessionType('playback', nav)).toBe(true)
    expect(nav.audioSession.type).toBe('playback')
  })

  it('promotes the session to play-and-record for microphone capture', () => {
    const nav = navigatorWithSession('playback')

    expect(requestAudioSessionType('play-and-record', nav)).toBe(true)
    expect(nav.audioSession.type).toBe('play-and-record')
  })

  it('does not downgrade an active play-and-record session to playback', () => {
    const nav = navigatorWithSession('play-and-record')

    expect(requestAudioSessionType('playback', nav)).toBe(true)
    expect(nav.audioSession.type).toBe('play-and-record')
  })

  it('is a no-op on platforms without the Audio Session API', () => {
    expect(requestAudioSessionType('playback', {})).toBe(false)
  })

  it('tolerates a missing navigator (non-browser environments)', () => {
    expect(requestAudioSessionType('playback', undefined)).toBe(false)
  })
})
