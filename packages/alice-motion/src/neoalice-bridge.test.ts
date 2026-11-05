import { describe, expect, it } from 'vitest'

import { MotionCatalog } from './catalog'
import { neoAliceBridgeTopics, NeoAliceTranslator } from './neoalice-bridge'

const catalog = new MotionCatalog()

function translator(options: { acceptAnySite?: boolean } = {}) {
  return new NeoAliceTranslator({ site: 'mirror', catalog, ...options })
}

const at = (seconds: number) => seconds * 1000
/** A smiling face, written as an escape so the source has no emoji. */
const smile = '\u{1F60A}'

describe('neoAliceBridgeTopics', () => {
  it('lists only read topics of the bridge site and of the companion', () => {
    const topics = neoAliceBridgeTopics({ site: 'mirror' })

    expect(topics).toContain('neoalice/v1/mirror/cmd/tts/say')
    expect(topics).toContain('neoalice/v1/companion/evt/companion/state')
    expect(topics.every(topic => topic.startsWith('neoalice/v1/mirror/') || topic.startsWith('neoalice/v1/companion/'))).toBe(true)
    expect(neoAliceBridgeTopics({ site: 'mirror', acceptAnySite: true })[0]).toBe('neoalice/v1/+/cmd/tts/say')
  })
})

describe('neoAliceTranslator', () => {
  it('reads the speech text the way the mirror module does', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', JSON.stringify({ text: 'Oi!', lang: 'pt-BR', session_id: 's1' }), 0))
      .toEqual({ type: 'speech-text', site: 'mirror', text: 'Oi!', lang: 'pt-BR', sessionId: 's1' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', JSON.stringify({ tts: { text: 'Tudo bem?', lang: 'pt-BR' } }), 0))
      .toMatchObject({ type: 'speech-text', text: 'Tudo bem?', lang: 'pt-BR' })
  })

  it('reads speech audio from audio.b64 or audio_base64', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ audio: { b64: 'UklGRg==' }, text: 'Oi', session_id: 's2' }), 0))
      .toEqual({ type: 'speech-audio', site: 'mirror', audioBase64: 'UklGRg==', text: 'Oi', sessionId: 's2' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ audio_base64: 'AAAA' }), 0))
      .toMatchObject({ type: 'speech-audio', audioBase64: 'AAAA' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/audio', JSON.stringify({ text: 'sem audio' }), 0))
      .toEqual({ type: 'ignored', topic: 'neoalice/v1/mirror/cmd/tts/audio', reason: 'no audio' })
  })

  it('reads stop, the final transcript, and both mood topics with the shared mood table', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/stop', '{}', 0)).toEqual({ type: 'speech-stop', site: 'mirror' })
    expect(bridge.translate('neoalice/v1/mirror/evt/stt/final', JSON.stringify({ text: 'oi alice' }), 0)).toEqual({ type: 'user-speech', site: 'mirror', text: 'oi alice' })
    expect(bridge.translate('neoalice/v1/mirror/evt/mood', JSON.stringify({ mood: 'Playful', intensity: 80 }), 0))
      .toMatchObject({ type: 'mood', origin: 'neoalice', intensity: 0.8, mood: { primary: 'playful', airiEmotion: 'happy' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/evt/mood', JSON.stringify({ state: { mood: 'melancholic' } }), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'sad' } })
  })

  it('turns gestures, poses, animations, and emojis into catalog intents', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'thumbup', duration: 3 }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'gesture_thumbup', requestedDurationMs: 3000, source: 'llm' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ name: 'wave', source: 'vision' }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'wave_right', source: 'vision' } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/pose', JSON.stringify({ pose: 'straight' }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'pose_straight', requestedChannels: ['posture'] } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/animation', JSON.stringify({ url: 'https://example.com/animations/walking.fbx', duration: 10 }), 0))
      .toMatchObject({ type: 'intent', intent: { semanticAction: 'walk', requestedDurationMs: 10_000 } })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/emoji', JSON.stringify({ emoji: smile }), 0))
      .toMatchObject({ type: 'intent', emoji: smile, intent: { semanticAction: 'emoji', requestedChannels: ['facial'] } })
  })

  it('gives each intent a new ID', () => {
    const bridge = translator()
    const first = bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"ok"}', at(0))
    const second = bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"ok"}', at(5))

    expect(first.type === 'intent' && second.type === 'intent' && first.intent.id !== second.intent.id).toBe(true)
  })

  it('refuses an unknown animation URL or gesture with a reason', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/animation', '{"url":"https://example.com/x/backflip.fbx"}', 0))
      .toEqual({ type: 'ignored', topic: 'neoalice/v1/mirror/cmd/avatar/animation', reason: 'the catalog has no action for this command' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', '{"gesture":"moonwalk"}', 0)).toMatchObject({ type: 'ignored' })
  })

  it('ignores other sites, repeated payloads, broken JSON, and oversized commands without throwing', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/kitchen/cmd/tts/say', '{"text":"x"}', 0)).toMatchObject({ type: 'ignored', reason: 'site "kitchen" is not the bridge site' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(1)).type).toBe('speech-text')
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(2))).toMatchObject({ type: 'ignored', reason: 'repeated payload' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{"text":"x"}', at(4)).type).toBe('speech-text')
    expect(bridge.translate('neoalice/v1/mirror/cmd/tts/say', '{not json', 0)).toMatchObject({ type: 'ignored', reason: 'payload is not JSON' })
    expect(bridge.translate('neoalice/v1/mirror/cmd/avatar/gesture', JSON.stringify({ gesture: 'ok', note: 'x'.repeat(5000) }), 0))
      .toMatchObject({ type: 'ignored', reason: 'message is larger than 4096 bytes' })
    expect(bridge.translate('hermes/tts/say', '{}', 0)).toMatchObject({ type: 'ignored', reason: 'not a NeoAlice v1 topic' })
    expect(translator({ acceptAnySite: true }).translate('neoalice/v1/kitchen/cmd/tts/say', '{"text":"x"}', 0).type).toBe('speech-text')
  })

  it('reads the mood of the companion state and affect', () => {
    const bridge = translator()

    expect(bridge.translate('neoalice/v1/companion/evt/companion/state', JSON.stringify({ mood: { primary: 'cozy', airiEmotion: 'happy', intensity: 40 } }), 0))
      .toMatchObject({ type: 'mood', origin: 'companion', intensity: 0.4, mood: { primary: 'cozy', airiEmotion: 'happy' } })
    expect(bridge.translate('neoalice/v1/companion/evt/companion/affect', JSON.stringify({ emotion: 'annoyed', airiEmotion: 'angry' }), 0))
      .toMatchObject({ type: 'mood', mood: { airiEmotion: 'angry' } })
    expect(bridge.translate('neoalice/v1/companion/evt/companion/state', JSON.stringify({ mood: null }), 0)).toMatchObject({ type: 'ignored' })
  })
})
