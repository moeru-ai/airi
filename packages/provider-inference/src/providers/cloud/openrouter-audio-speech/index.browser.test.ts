import { generateSpeech } from '@xsai/generate-speech'
import { afterEach, expect, it, vi } from 'vitest'

import { providerOpenRouterAudioSpeech } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

// https://github.com/moeru-ai/airi/issues/3456
// ROOT CAUSE:
//
// Dedicated speech returns binary audio. Raw PCM cannot play through decodeAudioData.
// The adapter adds a WAV container with each model's documented PCM16 rate and channel count.
it.each([
  ['heygen/heygen-voice-1-turbo', 44100],
  ['google/gemini-3.8-flash-tts', 24000],
] as const)('plays Issue #3456 speech from %s at %i Hz through decodeAudioData', async (model, sampleRate) => {
  const pcm = new Uint8Array(480 * 2)
  const samples = new DataView(pcm.buffer)
  for (let index = 0; index < 480; index++)
    samples.setInt16(index * 2, index % 2 === 0 ? 8192 : -8192, true)

  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (new URL(String(input)).pathname.endsWith('/models')) {
      return Response.json({
        data: [{
          id: model,
          architecture: { output_modalities: ['speech'] },
          endpoints: ['/api/v1/audio/speech'],
          supported_voices: ['test-voice'],
        }],
      })
    }
    return new Response(pcm, { headers: { 'Content-Type': 'audio/pcm' } })
  }))

  const provider = await providerOpenRouterAudioSpeech.createProvider({ apiKey: 'test-key', baseUrl: 'https://example.com/v1/' })
  if (!('speech' in provider))
    throw new Error('The provider has no speech method')
  const audio = await generateSpeech({ ...provider.speech(model), input: 'Hello.', voice: 'test-voice' })
  const context = new AudioContext({ sampleRate })
  try {
    const decoded = await context.decodeAudioData(audio)
    expect(decoded.numberOfChannels).toBe(1)
    expect(decoded.sampleRate).toBe(sampleRate)
    expect(decoded.length).toBe(480)
    expect(decoded.getChannelData(0)[0]).toBeCloseTo(0.25)
    expect(decoded.getChannelData(0)[1]).toBeCloseTo(-0.25)
  }
  finally {
    await context.close()
  }
})

// https://github.com/moeru-ai/airi/issues/3456
// ROOT CAUSE:
// Dedicated MP3 output must retain its encoded bytes for the browser decoder.
it('decodes Issue #3456 MP3 output through the real browser decoder', async () => {
  // Eight MPEG-1 Layer III mono frames at 128 kbps and 44.1 kHz.
  // Zero side information and main data encode silence without recorded content or encoder metadata.
  const mp3 = new Uint8Array(417 * 8)
  for (let frame = 0; frame < 8; frame++)
    mp3.set([0xFF, 0xFB, 0x90, 0xC4], frame * 417)

  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async input => new URL(String(input)).pathname.endsWith('/models')
    ? Response.json({ data: [{ id: 'minimax/speech-2.8-hd', architecture: { output_modalities: ['speech'] } }] })
    : new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } })))
  const provider = await providerOpenRouterAudioSpeech.createProvider({ apiKey: 'test-key', baseUrl: 'https://example.com/v1/' })
  if (!('speech' in provider))
    throw new Error('The provider has no speech method')
  const audio = await generateSpeech({ ...provider.speech('minimax/speech-2.8-hd'), input: 'Hello.', voice: 'test-voice' })
  expect(new Uint8Array(audio)).toEqual(mp3)
  const context = new AudioContext({ sampleRate: 44100 })
  try {
    const decoded = await context.decodeAudioData(audio)
    expect(decoded.numberOfChannels).toBe(1)
    expect(decoded.sampleRate).toBe(44100)
    expect(decoded.duration).toBeGreaterThan(0.1)
    expect(decoded.duration).toBeLessThan(0.3)
    expect(decoded.getChannelData(0).every(sample => sample === 0)).toBe(true)
  }
  finally {
    await context.close()
  }
})
