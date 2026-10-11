import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { loadCaseEnvironment } from '../cases/shared/configurations'

/** OpenAI `pcm` speech is 24 kHz mono signed 16-bit little-endian PCM without a header. */
const speechSampleRate = 24_000
/** The pinned KWS model and the existing fixtures use 16 kHz mono 16-bit PCM. */
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

  const bytes = Buffer.from(await response.arrayBuffer())
  const samples = new Float32Array(Math.floor(bytes.length / 2))
  for (let index = 0; index < samples.length; index++)
    samples[index] = bytes.readInt16LE(index * 2) / 32_768
  return samples
}

/** Converts the sample rate with a Hann-windowed sinc filter that removes content above the target Nyquist rate. */
function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate
  // A cutoff below the target Nyquist rate keeps aliasing out of the speech band.
  const cutoff = 0.95 * Math.min(1, toRate / fromRate)
  const halfWidth = 32
  const output = new Float32Array(Math.floor(samples.length / ratio))
  for (let index = 0; index < output.length; index++) {
    const center = index * ratio
    const first = Math.ceil(center - halfWidth)
    const last = Math.floor(center + halfWidth)
    let value = 0
    for (let source = Math.max(0, first); source <= Math.min(samples.length - 1, last); source++) {
      const offset = source - center
      const sinc = offset === 0 ? 1 : Math.sin(Math.PI * cutoff * offset) / (Math.PI * cutoff * offset)
      const window = 0.5 + 0.5 * Math.cos(Math.PI * offset / halfWidth)
      value += samples[source] * cutoff * sinc * window
    }
    output[index] = value
  }
  return output
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

function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const dataSize = samples.length * 2
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataSize, 40)

  const data = Buffer.alloc(dataSize)
  for (let index = 0; index < samples.length; index++)
    data.writeInt16LE(Math.round(Math.min(1, Math.max(-1, samples[index])) * 32_767), index * 2)
  return Buffer.concat([header, data])
}

async function generate(fixture: WakeWordFixture, environment: Record<string, string | undefined>) {
  const parts: Float32Array[] = [new Float32Array(fixture.leadingSilenceSeconds * fixtureSampleRate)]
  for (const phrase of fixture.phrases) {
    const speech = await synthesize(phrase, environment)
    parts.push(trimSilence(resample(speech, speechSampleRate, fixtureSampleRate), fixtureSampleRate))
    parts.push(new Float32Array(fixture.gapSeconds * fixtureSampleRate))
  }

  const samples = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    samples.set(part, offset)
    offset += part.length
  }

  const output = fileURLToPath(new URL(fixture.output, import.meta.url))
  await writeFile(output, encodeWav(samples, fixtureSampleRate))
  console.info(`Wrote ${fixture.output} (${(samples.length / fixtureSampleRate).toFixed(2)} s)`)
}

const environment = await loadCaseEnvironment(env)
for (const fixture of fixtures)
  await generate(fixture, environment)
