import type { BilingualTurnEvent, IntentBehavior, IntentHandle, PriorityLevel } from '@proj-airi/pipelines-audio'

import type { StageTtsSession } from '../libs/speech/tts-session'

import { defineEventa, defineInvoke, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { createBilingualTurnSplitter, TTS_FLUSH_INSTRUCTION } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid'

import { useLlmmarkerParser } from '../composables/llm-marker-parser'
import { useSpeechRuntimeStore } from '../stores/speech-runtime'
import { useBilingualCaptionBus } from './bilingual-captions'
import { openStageSpeechSession } from './stage-speech-session-host'

/**
 * One spark reaction / direct plugin utterance, driven as speech.
 *
 * Raw model text (UST brackets kept when bilingual) is fed through
 * {@link ReactionSpeechSurface.append}; the owner decides whether parsing,
 * splitting and captioning happen in this renderer or are forwarded to the
 * renderer that owns the playback Stage.
 */
export interface ReactionSpeechOptions {
  /** Playback items and caption pairs key on this id. */
  turnId: string
  /**
   * ISO 639-1 code of the translation language. Its presence turns on UST
   * splitting, flush-mode chunking and bilingual captions.
   */
  translationLanguage?: string
  priority?: PriorityLevel
  behavior?: IntentBehavior
  ownerId?: string
}

export interface ReactionSpeechSurface {
  /** Feeds one raw model chunk. Bracket content stays intact when bilingual. */
  append: (rawChunk: string) => void
  /** Drains the splitter tail, closes the parser, then ends the session. */
  finish: () => Promise<void>
  /** Aborts speech. Chunks arriving afterwards are ignored. */
  cancel: (reason?: string) => void
}

/** Sums the spoken projection of splitter events for message persistence. */
export function spokenProjection(events: Iterable<BilingualTurnEvent>): string {
  let spoken = ''
  for (const event of events) {
    if (event.kind === 'spoken')
      spoken += event.text
  }
  return spoken
}

/** Adapts a raw intent handle (cross-window fallback) to a speech surface. */
function sessionFromIntent(intent: IntentHandle): StageTtsSession {
  return {
    intentId: intent.intentId,
    appendText: intent.writeLiteral,
    appendSpecial: intent.writeSpecial,
    finishInput: intent.writeFlush,
    end: intent.end,
    cancel: intent.cancel,
  }
}

/**
 * Drives one session locally: marker parser into the TTS session plus the
 * bilingual splitter feeding the caption bus. Used by the Stage renderer
 * itself and, for remote turns, by the host-side reaction bridge.
 */
function createLocalReactionSpeech(
  session: StageTtsSession,
  options: ReactionSpeechOptions,
): ReactionSpeechSurface {
  const captionBus = useBilingualCaptionBus()
  const bilingual = options.translationLanguage !== undefined
  const splitter = bilingual ? createBilingualTurnSplitter() : undefined
  const translationLanguage = options.translationLanguage

  const parser = useLlmmarkerParser({
    onLiteral: (literal) => {
      if (literal)
        session.appendText(literal)
    },
    onSpecial: (special) => {
      if (special)
        session.appendSpecial(special)
    },
  })

  // A pair's flush marker is written as parser text in its wire position,
  // right after the pair's spoken sentence. The parser is the one serialized
  // channel into the session: a direct write would land immediately and
  // overtake the asynchronously delivered sentence, so the flush-mode
  // chunker would see the marker on an empty buffer and drop it, leaving the
  // pair without a playback boundary.
  function route(events: Iterable<BilingualTurnEvent>) {
    for (const event of events) {
      if (event.kind === 'spoken') {
        captionBus.ingestSpoken(options.turnId)
        if (event.text)
          void parser.consume(event.text)
      }
      else {
        void parser.consume(TTS_FLUSH_INSTRUCTION)
        captionBus.ingestTranslation(options.turnId, {
          language: translationLanguage as string,
          pairId: event.pairId,
          text: event.text,
        })
      }
    }
  }

  let closed = false

  return {
    append(rawChunk) {
      if (closed || !rawChunk)
        return
      if (splitter)
        route(splitter.consume(rawChunk))
      else
        void parser.consume(rawChunk)
    },
    async finish() {
      if (closed)
        return
      closed = true
      if (splitter)
        route(splitter.end())
      await parser.end()
      session.finishInput()
      session.end()
    },
    cancel(reason) {
      if (closed)
        return
      closed = true
      session.cancel(reason)
    },
  }
}

// --- Cross-renderer bridge -------------------------------------------------
//
// The spark orchestrator can run in a renderer that does not mount Stage
// (for example the Electron settings window and its temporary tester).
// Playback and caption reveal live in the Stage renderer, so the pair
// tracker and playback items must be created in that same process. This
// bridge forwards RAW model chunks to the Stage renderer, which then runs
// the identical local driver. Forwarding already-split tokens would also
// need a second transport for translations and reset signals; raw chunks
// keep the whole bilingual state machine co-located with playback.

const REACTION_BUS_CHANNEL_NAME = 'proj-airi:stage:reaction-speech'
/** BroadcastChannel invoke RTT between Electron renderers is single-digit ms. */
const HOST_START_TIMEOUT_MS = 300

interface ReactionStartRequest {
  originId: string
  turnId: string
  translationLanguage?: string
  priority?: PriorityLevel
  behavior?: IntentBehavior
  ownerId?: string
}

interface ReactionStartResponse {
  /** A Stage host opened the session and drives this turn. */
  accepted: boolean
}

interface ReactionTurnPayload {
  originId: string
  turnId: string
}

interface ReactionChunkPayload extends ReactionTurnPayload {
  chunk: string
}

interface ReactionCancelPayload extends ReactionTurnPayload {
  reason?: string
}

const reactionSpeechStartInvoke = defineInvokeEventa<ReactionStartResponse, ReactionStartRequest>('eventa:audio:speech:reaction:start')
const reactionSpeechChunkEvent = defineEventa<ReactionChunkPayload>('eventa:audio:speech:reaction:chunk')
const reactionSpeechEndEvent = defineEventa<ReactionTurnPayload>('eventa:audio:speech:reaction:end')
const reactionSpeechCancelEvent = defineEventa<ReactionCancelPayload>('eventa:audio:speech:reaction:cancel')

let busContext: ReturnType<typeof createBroadcastChannelContext>['context'] | undefined
const originId = `reaction-speech-${nanoid()}`

function getReactionBusContext() {
  if (!busContext)
    busContext = createBroadcastChannelContext(new BroadcastChannel(REACTION_BUS_CHANNEL_NAME)).context
  return busContext
}

function startRequest(options: ReactionSpeechOptions): ReactionStartRequest {
  return {
    originId,
    turnId: options.turnId,
    ...(options.translationLanguage !== undefined ? { translationLanguage: options.translationLanguage } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
    ...(options.behavior !== undefined ? { behavior: options.behavior } : {}),
    ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Forwards raw chunks to the Stage renderer that accepted the turn. Emits
 * are chained so postMessage order matches wire order; `finish` waits for
 * every chunk before sending the terminal event.
 */
function createRemoteReactionSpeech(options: ReactionSpeechOptions): ReactionSpeechSurface {
  const context = getReactionBusContext()
  let chain: Promise<void> = Promise.resolve()
  let closed = false

  return {
    append(rawChunk) {
      if (closed || !rawChunk)
        return
      const payload: ReactionChunkPayload = { originId, turnId: options.turnId, chunk: rawChunk }
      chain = chain.then(() => context.emit(reactionSpeechChunkEvent, payload))
    },
    async finish() {
      if (closed)
        return
      closed = true
      await chain
      await context.emit(reactionSpeechEndEvent, { originId, turnId: options.turnId })
    },
    cancel(reason) {
      if (closed)
        return
      closed = true
      void context.emit(reactionSpeechCancelEvent, { originId, turnId: options.turnId, reason })
    },
  }
}

/**
 * Resolves where one reaction utterance is spoken.
 *
 * Precedence:
 * 1. A Stage mounted in THIS renderer: transport-aware session and the
 *    caption bus that playback reveals, all in one process.
 * 2. A Stage mounted in ANOTHER renderer: raw chunks forwarded there so it
 *    runs the same local driver next to its playback manager.
 * 3. No Stage anywhere: a raw intent through the speech runtime. REST
 *    providers still speak; bilingual captions only work when this
 *    renderer itself displays the caption overlay.
 */
export async function openReactionSpeech(options: ReactionSpeechOptions): Promise<ReactionSpeechSurface> {
  const localSession = openStageSpeechSession({
    turnId: options.turnId,
    flushBoundaries: options.translationLanguage !== undefined,
    priority: options.priority ?? 'normal',
    behavior: options.behavior ?? 'queue',
    ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
  })
  if (localSession)
    return createLocalReactionSpeech(localSession, options)

  if (typeof BroadcastChannel !== 'undefined') {
    const context = getReactionBusContext()
    try {
      const response = await withTimeout(
        defineInvoke(context, reactionSpeechStartInvoke)(startRequest(options)),
        HOST_START_TIMEOUT_MS,
        'reaction speech host did not accept the turn in time',
      )
      if (response.accepted)
        return createRemoteReactionSpeech(options)
      // Explicit refusal: the host did not create a turn to clean up.
    }
    catch {
      // Timeout or transport error while a loaded host may accept the
      // start immediately afterwards. Cancel the turn so that orphaned
      // session cannot interrupt the local fallback. Same-channel
      // postMessage ordering processes the cancel right after the late
      // start on that host.
      await context.emit(reactionSpeechCancelEvent, {
        originId,
        turnId: options.turnId,
        reason: 'reaction-host-discovery-failed',
      }).catch(() => {})
    }
  }

  const intent = useSpeechRuntimeStore().openIntent({
    turnId: options.turnId,
    intentId: options.turnId,
    ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
    priority: options.priority,
    behavior: options.behavior,
    boundaryMode: options.translationLanguage !== undefined ? 'flush' : undefined,
  })
  return createLocalReactionSpeech(sessionFromIntent(intent), options)
}

/**
 * Registers this renderer as the host that speaks forwarded reactions.
 * Mounted once by Stage.vue; the disposer tears down every in-flight
 * remote turn when the Stage unmounts.
 */
export function registerReactionSpeechHost(): () => void {
  const context = getReactionBusContext()
  const captionBus = useBilingualCaptionBus()
  const turns = new Map<string, ReactionSpeechSurface>()
  // Bilingual reaction turns opened through this host. A new interrupting
  // reaction resets the previous turn's caption line and pair state.
  const bilingualTurnIds = new Set<string>()

  function deleteTurn(turnId: string) {
    turns.delete(turnId)
    bilingualTurnIds.delete(turnId)
  }

  const disposeInvoke = defineInvokeHandler(
    context,
    reactionSpeechStartInvoke,
    (request): ReactionStartResponse => {
      if (!request || request.originId === originId)
        return { accepted: false }
      // Retried start for a turn this host already accepted (e.g. the
      // requester raced its timeout). Keep the original surface.
      if (turns.has(request.turnId))
        return { accepted: true }

      const session = openStageSpeechSession({
        turnId: request.turnId,
        flushBoundaries: request.translationLanguage !== undefined,
        priority: request.priority ?? 'normal',
        behavior: request.behavior ?? 'queue',
        ...(request.ownerId !== undefined ? { ownerId: request.ownerId } : {}),
      })
      if (!session)
        return { accepted: false }

      if (request.translationLanguage !== undefined) {
        for (const previousTurnId of bilingualTurnIds)
          captionBus.resetTurn(previousTurnId)
        bilingualTurnIds.clear()
        bilingualTurnIds.add(request.turnId)
      }

      turns.set(request.turnId, createLocalReactionSpeech(session, {
        turnId: request.turnId,
        ...(request.translationLanguage !== undefined ? { translationLanguage: request.translationLanguage } : {}),
      }))
      return { accepted: true }
    },
  )

  const offChunk = context.on(reactionSpeechChunkEvent, (event) => {
    const payload = event.body
    if (!payload || payload.originId === originId)
      return
    turns.get(payload.turnId)?.append(payload.chunk)
  })

  const offEnd = context.on(reactionSpeechEndEvent, (event) => {
    const payload = event.body
    if (!payload || payload.originId === originId)
      return
    const surface = turns.get(payload.turnId)
    if (!surface)
      return
    deleteTurn(payload.turnId)
    void surface.finish()
  })

  const offCancel = context.on(reactionSpeechCancelEvent, (event) => {
    const payload = event.body
    if (!payload || payload.originId === originId)
      return
    const surface = turns.get(payload.turnId)
    if (!surface)
      return
    deleteTurn(payload.turnId)
    surface.cancel(payload.reason)
  })

  return () => {
    disposeInvoke()
    offChunk()
    offEnd()
    offCancel()
    for (const surface of turns.values())
      surface.cancel('reaction-host-unmounted')
    turns.clear()
    bilingualTurnIds.clear()
  }
}
