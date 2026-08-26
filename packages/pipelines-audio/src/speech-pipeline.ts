import type { Eventa } from '@moeru/eventa'

import type { SpeechPipelineEventName } from './eventa'
import type {
  IntentHandle,
  IntentOptions,
  LoggerLike,
  PlaybackItem,
  SpeechPipelineEvents,
  TextSegment,
  TextToken,
  TtsRequest,
  TtsResult,
} from './types'

import { createContext } from '@moeru/eventa'

import { speechPipelineEventMap } from './eventa'
import { createPriorityResolver } from './priority'
import { createTtsSegmentStream } from './processors/tts-chunker'
import { createPushStream } from './stream'
import { createTimeline } from './timeline'

export interface SpeechPipelineOptions<TAudio> {
  logger?: LoggerLike
  playback: {
    onEnd: (listener: (event: { endedAt: number, item: PlaybackItem<TAudio> }) => void) => void
    onInterrupt: (listener: (event: { interruptedAt: number, item: PlaybackItem<TAudio>, reason: string }) => void) => void
    onReject: (listener: (event: { item: PlaybackItem<TAudio>, reason: string }) => void) => void
    onStart: (listener: (event: { item: PlaybackItem<TAudio>, startedAt: number }) => void) => void
    schedule: (item: PlaybackItem<TAudio>) => void
    stopAll: (reason: string) => void
    stopByIntent: (intentId: string, reason: string) => void
    stopByOwner: (ownerId: string, reason: string) => void
  }
  priority?: ReturnType<typeof createPriorityResolver>
  segmenter?: (tokens: ReadableStream<TextToken>, meta: { intentId: string, streamId: string, turnId?: string }) => ReadableStream<TextSegment>
  tts: (request: TtsRequest, signal: AbortSignal) => Promise<null | TAudio>
  /**
   * Maximum number of concurrent TTS generation tasks. Default is 4. Must be at least 1.
   *
   * @default 4
   */
  ttsMaxConcurrent?: number
}

interface IntentState {
  behavior: 'interrupt' | 'queue' | 'replace'
  canceled: boolean
  closeStream: () => void
  controller: AbortController
  createdAt: number
  intentId: string
  ownerId?: string
  priority: number
  stream: ReadableStream<TextToken>
  streamId: string
  turnId?: string
}

export function createSpeechPipeline<TAudio>(options: SpeechPipelineOptions<TAudio>) {
  const logger = options.logger ?? console
  const priorityResolver = options.priority ?? createPriorityResolver()
  const segmenter = options.segmenter ?? createTtsSegmentStream
  const ttsMaxConcurrent = Math.max(1, options.ttsMaxConcurrent ?? 4)
  const context = createContext()
  const timeline = createTimeline()

  const intents = new Map<string, IntentState>()
  const pending: IntentState[] = []
  let activeIntent: IntentState | null = null
  const playbackWaiters = new Map<string, () => void>()

  function resolvePlayback(itemId: string) {
    const resolve = playbackWaiters.get(itemId)
    if (!resolve)
      return

    playbackWaiters.delete(itemId)
    resolve()
  }

  options.playback.onStart(event => context.emit(speechPipelineEventMap.onPlaybackStart, event))
  options.playback.onEnd((event) => {
    context.emit(speechPipelineEventMap.onPlaybackEnd, event)
    resolvePlayback(event.item.id)
  })
  options.playback.onInterrupt((event) => {
    context.emit(speechPipelineEventMap.onPlaybackInterrupt, event)
    resolvePlayback(event.item.id)
  })
  options.playback.onReject((event) => {
    context.emit(speechPipelineEventMap.onPlaybackReject, event)
    resolvePlayback(event.item.id)
  })

  function waitForPlayback(item: PlaybackItem<TAudio>) {
    return new Promise<void>((resolve) => {
      playbackWaiters.set(item.id, resolve)
      try {
        options.playback.schedule(item)
      }
      catch (err) {
        playbackWaiters.delete(item.id)
        logger.warn('Playback schedule failed:', err)
        resolve()
      }
    })
  }

  function enqueueIntent(intent: IntentState) {
    pending.push(intent)
  }

  function pickNextIntent() {
    if (pending.length === 0)
      return null
    pending.sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt))
    return pending.shift() ?? null
  }

  async function runIntent(intent: IntentState) {
    activeIntent = intent
    context.emit(speechPipelineEventMap.onIntentStart, intent.intentId)
    if (intent.turnId)
      context.emit(speechPipelineEventMap.onTurnStart, intent.turnId)

    const tokenStream = intent.stream
    const segmentStream = segmenter(tokenStream, { intentId: intent.intentId, streamId: intent.streamId, turnId: intent.turnId })
    const completedRequests = new Map<number, null | TtsResult<TAudio>>()
    const inFlightTasks = new Set<Promise<void>>()
    let nextRequestSequence = 0
    let nextSequenceToSchedule = 0

    function enqueueSpecial(segment: TextSegment) {
      timeline.enqueue({
        id: `special:${segment.segmentId}`,
        run() {
          if (intent.canceled || intent.controller.signal.aborted)
            return

          context.emit(speechPipelineEventMap.onSpecial, segment)
        },
        track: 'speech',
      })
    }

    function enqueuePlayback(item: PlaybackItem<TAudio>) {
      timeline.enqueue({
        id: `playback:${item.id}`,
        async run() {
          if (intent.canceled || intent.controller.signal.aborted)
            return

          await waitForPlayback(item)

          if (intent.canceled || intent.controller.signal.aborted)
            return

          if (item.special) {
            context.emit(speechPipelineEventMap.onSpecial, {
              createdAt: item.createdAt,
              intentId: item.intentId,
              reason: 'special',
              segmentId: item.segmentId,
              special: item.special,
              streamId: item.streamId,
              text: item.text,
              turnId: item.turnId,
            })
          }
        },
        track: 'speech',
      })
    }

    function scheduleCompletedRequests() {
      while (completedRequests.has(nextSequenceToSchedule)) {
        const completedRequest = completedRequests.get(nextSequenceToSchedule) ?? null
        completedRequests.delete(nextSequenceToSchedule)

        if (completedRequest) {
          enqueuePlayback({
            audio: completedRequest.audio,
            createdAt: Date.now(),
            id: createId('playback'),
            intentId: completedRequest.intentId,
            ownerId: intent.ownerId,
            priority: intent.priority,
            segmentId: completedRequest.segmentId,
            sequence: completedRequest.sequence,
            special: completedRequest.special,
            streamId: completedRequest.streamId,
            text: completedRequest.text,
            turnId: completedRequest.turnId,
          })
        }

        nextSequenceToSchedule += 1
      }
    }

    function createTtsTask(request: TtsRequest) {
      const task = (async () => {
        let audio: null | TAudio = null
        try {
          audio = await options.tts(request, intent.controller.signal)
        }
        catch (err) {
          logger.warn('TTS generation failed:', err)
          if (intent.controller.signal.aborted)
            return
        }

        if (intent.controller.signal.aborted) {
          completedRequests.set(request.sequence, null)
          scheduleCompletedRequests()
          return
        }

        if (!audio) {
          completedRequests.set(request.sequence, null)
          scheduleCompletedRequests()
          return
        }

        const ttsResult: TtsResult<TAudio> = {
          audio,
          createdAt: Date.now(),
          intentId: request.intentId,
          segmentId: request.segmentId,
          sequence: request.sequence,
          special: request.special,
          streamId: request.streamId,
          text: request.text,
          turnId: request.turnId,
        }

        context.emit(speechPipelineEventMap.onTtsResult, ttsResult)
        completedRequests.set(request.sequence, ttsResult)
        scheduleCompletedRequests()
      })()
        .finally(() => {
          inFlightTasks.delete(task)
        })

      inFlightTasks.add(task)
      return task
    }

    try {
      const reader = segmentStream.getReader()

      while (true) {
        while (!intent.controller.signal.aborted && inFlightTasks.size >= ttsMaxConcurrent) {
          await Promise.race(inFlightTasks)
        }

        const { done, value } = await reader.read()
        if (done)
          break
        if (!value)
          continue
        if (intent.canceled || intent.controller.signal.aborted) {
          await reader.cancel()
          break
        }

        context.emit(speechPipelineEventMap.onSegment, value)

        if (value.text === '' && value.special) {
          enqueueSpecial(value)
          continue
        }

        const request: TtsRequest = {
          createdAt: Date.now(),
          intentId: value.intentId,
          priority: intent.priority,
          segmentId: value.segmentId,
          sequence: nextRequestSequence++,
          special: value.special,
          streamId: value.streamId,
          text: value.text,
          turnId: value.turnId,
        }

        context.emit(speechPipelineEventMap.onTtsRequest, request)
        createTtsTask(request)
      }

      await Promise.allSettled(inFlightTasks)
      scheduleCompletedRequests()
      await timeline.flush('speech')
      reader.releaseLock()
    }
    catch (err) {
      logger.warn('Speech pipeline intent failed:', err)
    }
    finally {
      if (intent.canceled) {
        context.emit(speechPipelineEventMap.onIntentCancel, { intentId: intent.intentId, reason: intent.controller.signal.reason?.toString() })
        if (intent.turnId)
          context.emit(speechPipelineEventMap.onTurnCancel, { reason: intent.controller.signal.reason?.toString(), turnId: intent.turnId })
      }
      else {
        context.emit(speechPipelineEventMap.onIntentEnd, intent.intentId)
        if (intent.turnId)
          context.emit(speechPipelineEventMap.onTurnEnd, intent.turnId)
      }

      intents.delete(intent.intentId)
      if (activeIntent?.intentId === intent.intentId)
        activeIntent = null

      if (!activeIntent) {
        const next = pickNextIntent()
        if (next)
          void runIntent(next)
      }
    }
  }

  function openIntent(optionsInput?: IntentOptions): IntentHandle {
    const intentId = optionsInput?.intentId ?? createId('intent')
    const turnId = optionsInput?.turnId
    const streamId = optionsInput?.streamId ?? createId('stream')
    const priority = priorityResolver.resolve(optionsInput?.priority)
    const behavior = optionsInput?.behavior ?? 'queue'
    const ownerId = optionsInput?.ownerId

    const controller = new AbortController()
    const { close, stream, write } = createPushStream<TextToken>()
    let sequence = 0

    const intent: IntentState = {
      behavior,
      canceled: false,
      closeStream: close,
      controller,
      createdAt: Date.now(),
      intentId,
      ownerId,
      priority,
      stream,
      streamId,
      turnId,
    }

    intents.set(intentId, intent)

    const handle: IntentHandle = {
      cancel(reason?: string) {
        cancelIntent(intentId, reason)
      },
      end() {
        close()
      },
      intentId,
      ownerId,
      priority,
      stream,
      streamId,
      turnId,
      writeFlush() {
        if (intent.canceled)
          return
        write({
          createdAt: Date.now(),
          intentId,
          sequence: sequence++,
          streamId,
          turnId,
          type: 'flush',
        })
      },
      writeLiteral(text: string) {
        if (intent.canceled)
          return
        write({
          createdAt: Date.now(),
          intentId,
          sequence: sequence++,
          streamId,
          turnId,
          type: 'literal',
          value: text,
        })
      },
      writeSpecial(special: string) {
        if (intent.canceled)
          return
        write({
          createdAt: Date.now(),
          intentId,
          sequence: sequence++,
          streamId,
          turnId,
          type: 'special',
          value: special,
        })
      },
    }

    if (!activeIntent) {
      void runIntent(intent)
      return handle
    }

    if (behavior === 'replace') {
      cancelIntent(activeIntent.intentId, 'replace')
      void runIntent(intent)
      return handle
    }

    if (behavior === 'interrupt' && intent.priority >= activeIntent.priority) {
      cancelIntent(activeIntent.intentId, 'interrupt')
      void runIntent(intent)
      return handle
    }

    enqueueIntent(intent)
    return handle
  }

  function cancelIntent(intentId: string, reason?: string) {
    const intent = intents.get(intentId)
    if (!intent)
      return
    intent.canceled = true
    intent.controller.abort(reason ?? 'canceled')
    intent.closeStream()

    if (activeIntent?.intentId === intentId) {
      options.playback.stopByIntent(intentId, reason ?? 'canceled')
      return
    }

    const index = pending.findIndex(item => item.intentId === intentId)
    if (index >= 0)
      pending.splice(index, 1)
  }

  function interrupt(reason: string) {
    if (activeIntent)
      cancelIntent(activeIntent.intentId, reason)
  }

  function stopAll(reason: string) {
    for (const intent of intents.values()) {
      intent.canceled = true
      intent.controller.abort(reason)
      intent.closeStream()
    }
    pending.length = 0
    intents.clear()
    activeIntent = null
    options.playback.stopAll(reason)
  }

  return {
    cancelIntent,
    interrupt,
    on<K extends SpeechPipelineEventName>(event: K, listener: SpeechPipelineEvents<TAudio>[K]) {
      const typedListener = listener as (payload: unknown) => void

      return context.on(speechPipelineEventMap[event] as Eventa<{ body?: unknown }>, (payload) => {
        typedListener(payload?.body ?? payload)
      })
    },
    openIntent,
    stopAll,
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
