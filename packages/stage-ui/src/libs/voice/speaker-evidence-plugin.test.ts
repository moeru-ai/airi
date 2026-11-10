import type { SpeechSubmission, TranscriptionEvent } from '@proj-airi/core-agent'
import type { AudioWindow, PcmBlock } from '@proj-airi/pipelines-audio'

import type { SpeakerEvidenceUpdate } from './speaker-evidence-plugin'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { expect, it, vi } from 'vitest'

import { createSpeakerEvidencePlugin, OWNER_SPEAKER_ID } from './speaker-evidence-plugin'
import { createVoiceActivityPlugin } from './voice-activity-plugin'

/**
 * Runs one automatic input through the voice activity plugin and the speaker evidence plugin.
 *
 * The source runs at 1000 Hz, so one frame is 1 ms. Frames before `speechEnd` are speech, and later frames are silence.
 * The test writes 250 ms blocks and waits until the speaker plugin reads each new window, because `latest`
 * scheduling skips a window that arrives while another one waits.
 */
async function runInput(options: { speechEnd: number, totalFrames: number, compare: (window: AudioWindow) => Promise<number>, enabled?: () => boolean }) {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream }, { historyMs: 360 })
  const submit = vi.fn(async (_submission: SpeechSubmission) => ({ status: 'committed' as const, messageId: 'message' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({
    transcribe: request => new ReadableStream<TranscriptionEvent>({ async start(output) {
      for await (const _block of request.audio) {
        // The transcription completes when the capture ends.
      }
      output.enqueue({ type: 'update', revision: 1, segments: [{ id: 'words', revision: 1, text: 'Hello', final: true, tokens: [] }] })
      output.enqueue({ type: 'complete', revision: 1 })
      output.close()
    } }),
  }) })
  const updates: SpeakerEvidenceUpdate[] = []
  const results: string[] = []
  const input = vi.fn(() => controller.activeInput)
  const speaker = createSpeakerEvidencePlugin({
    enabled: options.enabled ?? (() => true),
    compare: options.compare,
    input,
    update: (update) => {
      updates.push(update)
      results.push(controller.updateSpeakerEvidence(update.inputId, { range: update.range, value: update.value }).status)
    },
  })
  controller.use(createVoiceActivityPlugin({
    detect: async window => window.channels[0][0],
    target: () => ({ sessionId: 'alice', interruptTurns: [] }),
    onActivity: activity => speaker.noteActivity(activity),
    minSpeechMs: 32,
  }), { grants: ['input-control', 'cancel-input'] })
  controller.use(speaker)
  await Promise.resolve()

  for (let start = 0; start < options.totalFrames; start += 250) {
    const samples = new Float32Array(250)
    samples.fill(1, 0, Math.max(0, Math.min(250, options.speechEnd - start)))
    source.write({ range: { sourceId: 'mic', startFrame: start, endFrame: start + 250 }, sampleRate: 1000, channels: [samples] })
    // The first 1000 ms window ends with the fourth block. Each later block ends one more window.
    const windows = Math.max(0, (start + 250 - 1000) / 250 + 1)
    if (options.enabled?.() !== false)
      await expect.poll(() => input.mock.calls.length).toBe(windows)
  }
  await expect.poll(() => submit.mock.calls.length).toBe(1)
  await controller.close()
  return { submission: submit.mock.calls[0][0], updates, results }
}

it('scores the speech of an input against the owner and writes it as speaker evidence', async () => {
  // Each window scores its start time in tenths of a millisecond, so the counted windows are visible in the scores.
  const { submission, updates, results } = await runInput({ speechEnd: 1700, totalFrames: 3000, compare: async window => window.range.startFrame / 10000 })

  // The VAD marks 54 windows of 32 ms as speech, up to 1728 ms. 1200 ms of silence then ends the input at 2944 ms.
  // The windows that start from 0 ms to 1000 ms are at least half speech. The window from 1250 ms has 478 ms of speech.
  const last = updates.at(-1)!
  expect(last.scores).toEqual([0, 0.025, 0.05, 0.075, 0.1])
  expect(last.range).toEqual({ sourceId: 'mic', startFrame: 0, endFrame: 2000 })
  expect(last.value.voicedMs).toBe(1728)
  expect(results).toEqual(Array.from({ length: 5 }).fill('applied'))

  expect(submission.speakers?.candidates).toHaveLength(1)
  expect(submission.speakers?.candidates[0].speakerId).toBe(OWNER_SPEAKER_ID)
  expect(submission.speakers?.candidates[0].score).toBeCloseTo(0.05)
  expect(submission.speakers?.voicedMs).toBe(1728)
})

it('does not count a window without an embedding', async () => {
  const { updates } = await runInput({
    speechEnd: 1700,
    totalFrames: 3000,
    // Digital silence has no embedding. Sherpaw then returns NaN for the window.
    compare: async window => window.range.startFrame === 250 ? Number.NaN : 0.5,
  })

  expect(updates.at(-1)!.scores).toEqual([0.5, 0.5, 0.5, 0.5])
})

it('compares nothing while speaker recognition is off', async () => {
  const compare = vi.fn(async () => 0.5)
  const { submission, updates } = await runInput({ speechEnd: 1700, totalFrames: 3000, compare, enabled: () => false })

  expect(compare).not.toHaveBeenCalled()
  expect(updates).toEqual([])
  expect(submission.speakers).toBeUndefined()
})
