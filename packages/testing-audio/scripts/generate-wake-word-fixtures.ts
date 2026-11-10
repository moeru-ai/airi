import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { writeFile } from 'node:fs/promises'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { encodeWav, toFloat32FromPCM16 } from '@proj-airi/audio/encoding'

import { loadCaseEnvironment } from '../cases/shared/configurations'

/** OpenAI `pcm` speech is 24 kHz mono signed 16-bit little-endian PCM without a header. */
const speechSampleRate = 24_000
/** The pinned KWS model and the existing fixtures use 16 kHz mono 16-bit PCM. `encodeWav` resamples to this rate. */
const fixtureSampleRate = 16_000

interface WakeWordFixture {
  /** Fixture file, relative to this script. */
  output: string
  /** Silence before the first phrase. The application loads the KWS model during this time. */
  leadingSilenceSeconds: number
  /** Phrases in recording order. Each phrase is one speech request. */
  phrases: string[]
  /** Silence after each phrase. */
  gapSeconds: number
}

/**
 * Fixtures of the TTS-generated wake word cases. Keep this list in step with the README table.
 * The `wake-word` case fixture uses the macOS Samantha voice, so this script does not write it.
 */
const fixtures: WakeWordFixture[] = [
  {
    output: '../cases/wake-word-routing/input.test.wav',
    leadingSilenceSeconds: 15,
    phrases: ['Hello computer.', 'Hello computer.', 'Hello computer.'],
    gapSeconds: 1,
  },
  {
    output: '../cases/wake-word-second-pronunciation/input.test.wav',
    leadingSilenceSeconds: 15,
    phrases: ['芝麻开门。', '芝麻开门。', '芝麻开门。'],
    gapSeconds: 1,
  },
]

async function synthesize(phrase: string, environment: Record<string, string | undefined>): Promise<Float32Array> {
  const apiKey = environment.TESTING_AUDIO_TTS_API_KEY
  if (!apiKey)
    throw new Error('Set TESTING_AUDIO_TTS_API_KEY to generate wake word fixtures.')

  const baseUrl = environment.TESTING_AUDIO_TTS_API_BASE_URL ?? 'https://api.openai.com/v1/'
  const response = await fetch(new URL('audio/speech', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`), {
    method: 'POST',
    headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: environment.TESTING_AUDIO_TTS_MODEL ?? 'tts-1',
      voice: environment.TESTING_AUDIO_TTS_VOICE ?? 'alloy',
      input: phrase,
      response_format: 'pcm',
    }),
  })
  // The response body can repeat request details, so the error includes only the status.
  if (!response.ok)
    throw new Error(`The speech request for "${phrase}" failed with status ${response.status}.`)

  return toFloat32FromPCM16(new Uint8Array(await response.arrayBuffer()))
}

/**
 * Removes leading and trailing near-silence, so the fixture layout sets every pause.
 * A margin of 100 ms on each side keeps soft onsets, such as the "h" of "hello".
 */
function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.01): Float32Array {
  const start = samples.findIndex(sample => Math.abs(sample) > threshold)
  if (start < 0)
    return new Float32Array(0)
  const end = samples.findLastIndex(sample => Math.abs(sample) > threshold)
  const margin = Math.round(sampleRate * 0.1)
  return samples.subarray(Math.max(0, start - margin), Math.min(samples.length, end + 1 + margin))
}

async function generate(fixture: WakeWordFixture, environment: Record<string, string | undefined>) {
  // The fixture is assembled at the speech rate. `encodeWav` resamples it to the fixture rate.
  const parts: Float32Array[] = [new Float32Array(fixture.leadingSilenceSeconds * speechSampleRate)]
  for (const phrase of fixture.phrases) {
    parts.push(trimSilence(await synthesize(phrase, environment), speechSampleRate))
    parts.push(new Float32Array(fixture.gapSeconds * speechSampleRate))
  }

  const samples = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    samples.set(part, offset)
    offset += part.length
  }

  const block: PcmBlock = { range: { sourceId: fixture.output, startFrame: 0, endFrame: samples.length }, sampleRate: speechSampleRate, channels: [samples] }
  const stream = new ReadableStream<PcmBlock>({
    start(controller) {
      controller.enqueue(block)
      controller.close()
    },
  })
  // TODO:
  // Mediabunny resamples with linear interpolation and no anti-aliasing filter (`resample.js`).
  // Voice messages use this `encodeWav` before transcription too.
  // Add a low-pass filter in `@proj-airi/audio`. These fixtures pass with it and with a sinc resampler.
  const wav = await encodeWav(stream, { sampleRate: fixtureSampleRate, channels: 1 })
  const output = fileURLToPath(new URL(fixture.output, import.meta.url))
  await writeFile(output, new Uint8Array(await wav.arrayBuffer()))
  console.info(`Wrote ${fixture.output} (${(samples.length / speechSampleRate).toFixed(2)} s)`)
}

const environment = await loadCaseEnvironment(env)
for (const fixture of fixtures)
  await generate(fixture, environment)
