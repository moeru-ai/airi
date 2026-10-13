import type { LiveDecoder, LiveEndpoint, LiveUpdate, ProbeResult, SpeechSelectionOptions } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import type { ProbeDecoders } from './use-probe-decoders'
import type { ProbeRunSettings } from './use-uncertainty-probe'

import { errorMessageFrom } from '@moeru/std'
import {
  AudioHistory,
  normalizeToken,
  planLiveStreams,
  samplePerturbations,
  selectSpeech,
  streamedProbeResult,
} from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { onScopeDispose, ref, shallowRef } from 'vue'

export interface LiveSettings extends ProbeRunSettings {
  readonly selection: SpeechSelectionOptions
}

/** One segment of live speech and its probe. */
export interface LiveUtterance {
  readonly id: number
  /** Seconds from the start of the input to the start of the probed clip. */
  readonly start: number
  readonly end: number
  /** What the clean stream heard. */
  readonly liveText: string
  /** `waiting` lasts until every rollout has decoded the segment. */
  readonly status: 'waiting' | 'done' | 'error'
  readonly result?: ProbeResult
  readonly error?: string
  /** Seconds from the arrival of the input at the endpoint to the finished probe. It includes the lag. */
  readonly latency?: number
}

/**
 * Decodes live input clean and with noise at the same time, and probes each segment at its endpoint.
 *
 * Every rollout is a stream that gets the input as it arrives, with its own noise. The clean stream
 * leads in the first Worker. Its endpoints cut every stream at the same input, so a segment's probe is
 * ready when the slowest Worker has decoded the segment. Live mode adds noise only. Time shift and
 * speed need the whole clip, and the early stop needs the reference first.
 *
 * A segment without tokens is probed only when it has loud syllables, because it can hold speech that
 * the model deleted.
 */
export function useLiveProbe(decoders: ProbeDecoders) {
  const status = ref<'idle' | 'loading' | 'listening' | 'error'>('idle')
  const partial = ref('')
  const error = ref<string>()
  const utterances = shallowRef<readonly LiveUtterance[]>([])
  /** Seconds of input that the slowest Worker has not decoded yet. It grows when the Workers are slower than real time. */
  const lag = ref(0)

  let session: AbortController | undefined

  function update(id: number, change: Partial<LiveUtterance>) {
    utterances.value = utterances.value.map(utterance => utterance.id === id ? { ...utterance, ...change } : utterance)
  }

  async function start(chunks: (signal: AbortSignal) => AsyncIterable<Float32Array>, settings: LiveSettings) {
    cancel()
    const current = new AbortController()
    session = current
    status.value = 'loading'
    error.value = undefined
    partial.value = ''
    utterances.value = []
    lag.value = 0

    const perturbations = samplePerturbations(settings.count, { snrDb: settings.ranges.snrDb, shiftMs: [0, 0], speed: [1, 1] }, settings.seed)
    const plan = planLiveStreams(perturbations, settings.blankPenalty, settings.workers)
    const created: LiveDecoder[] = []
    try {
      // The pool keeps its Workers and their model between runs, so only the first run loads the model.
      const pool = await decoders.poolFor(settings.model, settings.workers)
      if (session !== current)
        return
      // Every listen must settle, so a failed start leaves no session open.
      const starts = await Promise.allSettled(plan.workers.map((streams, index) => pool.decoders[index].listen({ sampleRate: settings.sampleRate, streams, leads: index === 0 })))
      for (const started of starts) {
        if (started.status === 'fulfilled')
          created.push(started.value)
      }
      const failed = starts.find(started => started.status === 'rejected')
      if (failed)
        throw failed.reason
      if (session !== current)
        return
      const [leader, ...followers] = created
      status.value = 'listening'

      const history = new AudioHistory(settings.sampleRate)
      /** The loudest level of speech so far. It tells a deleted utterance from background noise. */
      let speechDb: number | undefined
      let nextId = 0
      /** Input samples that each Worker has decoded. */
      const decoded = created.map(() => 0)
      /** When the input started, in `performance.now()` time. */
      let inputStartedAt: number | undefined
      /** The first failure of a follower. Its decodes are not awaited, so the loop checks this. */
      let failure: unknown

      const measureLag = () => {
        if (inputStartedAt !== undefined && session === current)
          lag.value = Math.max(0, (performance.now() - inputStartedAt) / 1000 - Math.min(...decoded) / settings.sampleRate)
      }

      /** Probes one cut. The leader's segments arrive at once, the followers' segments when they reach the cut. */
      const handleCut = (endpoint: LiveEndpoint, following: Promise<LiveEndpoint[]>) => {
        const reference = endpoint.segments[0]
        const samples = history.slice(reference.startTime, endpoint.endTime)
        // The next segment can start a little before this endpoint, because the decoder holds back
        // its last frames. Two seconds of history covers that.
        history.dropBefore(endpoint.endTime - 2)
        const hasTokens = reference.tokens.some(token => normalizeToken(token) !== '')
        const selection = selectSpeech(samples, settings.sampleRate, hasTokens, speechDb, settings.selection)
        if (!selection) {
          following.catch(() => {})
          return
        }
        if (hasTokens)
          speechDb = Math.max(speechDb ?? Number.NEGATIVE_INFINITY, selection.loudDb)

        const id = nextId++
        // The input at the endpoint arrived this long after the input started, if it came in real time.
        const endpointAt = (inputStartedAt ?? performance.now()) + endpoint.endTime * 1000
        const clipStart = reference.startTime + selection.offset
        utterances.value = [...utterances.value, { id, start: clipStart, end: endpoint.endTime, liveText: reference.text, status: 'waiting' }]
        const clip = samples.subarray(Math.round(selection.offset * settings.sampleRate))
        following
          .then((others) => {
            if (session !== current)
              return
            const segments = [endpoint.segments, ...others.map(other => other.segments)]
            const result = streamedProbeResult(clip, settings.sampleRate, clipStart, segments, plan, perturbations)
            update(id, { status: 'done', result, latency: (performance.now() - endpointAt) / 1000 })
          })
          .catch((cause) => {
            if (session === current)
              update(id, { status: 'error', error: errorMessageFrom(cause) ?? 'The probe failed.' })
          })
      }

      const handle = ({ partial: open, endpoints }: LiveUpdate) => {
        partial.value = open?.text ?? ''
        for (const endpoint of endpoints) {
          // Each follower cuts after the input that it got so far, which is the input of this endpoint.
          // The cut must be sent before the next block.
          handleCut(endpoint, Promise.all(followers.map(follower => follower.cut())))
        }
      }

      for await (const samples of chunks(current.signal)) {
        if (failure)
          throw failure
        inputStartedAt ??= performance.now() - samples.length / settings.sampleRate * 1000
        history.append(samples)
        followers.forEach((follower, index) => {
          follower.accept(samples).then(() => {
            decoded[index + 1] += samples.length
            measureLag()
          }, (cause) => {
            failure ??= cause
          })
        })
        const leading = await leader.accept(samples)
        decoded[0] += samples.length
        measureLag()
        if (session !== current)
          return
        handle(leading)
      }
      if (session !== current)
        return
      if (failure)
        throw failure
      const [last, ...others] = await Promise.all(created.map(decoder => decoder.finish()))
      if (session !== current)
        return
      partial.value = ''
      handleCut(last, Promise.resolve(others))
      status.value = 'idle'
    }
    catch (cause) {
      if (session !== current)
        return
      error.value = errorMessageFrom(cause) ?? 'Live decoding failed.'
      status.value = 'error'
    }
    finally {
      // A Worker answers calls in order, so the cuts sent before `close` still answer.
      // `close` does nothing after `finish`. The Workers keep the model for the next run.
      for (const decoder of created)
        void decoder.close().catch(() => {})
    }
  }

  /** Ends the input. The segment that is still open gets its probe. */
  function stop() {
    session?.abort()
  }

  /** Ends the input and drops the segments that have no probe yet. */
  function cancel() {
    session?.abort()
    session = undefined
    status.value = 'idle'
  }

  onScopeDispose(cancel)

  return { status, partial, error, utterances, lag, start, stop, cancel }
}
