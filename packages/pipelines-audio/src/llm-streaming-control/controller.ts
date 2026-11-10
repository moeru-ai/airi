import type {
  LlmStreamingControl,
  LlmStreamingControlCallContext,
  LlmStreamingControlCallHandler,
  LlmStreamingControlCallManifest,
  LlmStreamingControlOptions,
  LlmStreamingControlSignal,
  LlmStreamingControlSignalContext,
  LlmStreamingControlSignalHandler,
  LlmStreamingControlTurn,
  LlmStreamingControlTurnDone,
} from './types'

import { tokenAct, tokenCall, tokenDelay } from './parsers'
import { renderCallManifestPrompt } from './parsers/call'

interface StreamingControlTurnState {
  callManifests: Map<string, LlmStreamingControlCallManifest>
  done: Promise<LlmStreamingControlTurnDone>
  handlers: Map<string, Set<LlmStreamingControlCallHandler>>
  settle: (result: LlmStreamingControlTurnDone) => void
}

/**
 * Creates a controller over LLM streaming-control tokens.
 *
 * Use when:
 * - A stage runtime needs to dispatch special tokens from one playback source
 * - A plugin bridge needs to register CALL callbacks against the same controller instance
 *
 * Expects:
 * - The caller owns the controller lifetime
 *
 * Returns:
 * - A controller with `match`, `dispatchWith`, `on`
 *
 * Notice:
 * - Core behavior intentionally preserved
 * - Refactored for readability and lower duplication
 * - Handler execution order preserved
 */
export function createStreamingControlParser(
  options: LlmStreamingControlOptions = {},
): LlmStreamingControl {
  const handlers = new Map<string, Set<LlmStreamingControlCallHandler>>()
  const callManifests = new Map<string, LlmStreamingControlCallManifest>()
  const turns = new Map<string, StreamingControlTurnState>()
  const signalHandlers = new Set<LlmStreamingControlSignalHandler>()

  const parsers = options.parsers ?? [
    tokenAct(),
    tokenDelay(),
    tokenCall(),
  ]

  /**
   * Finds matching parser.
   *
   * Notice:
   * - Single lookup reused everywhere
   */
  function findParser(input: string) {
    return parsers.find(parser => parser.match(input))
  }

  /**
   * Completes and destroys turn.
   *
   * Notice:
   * - Centralized cleanup path
   */
  function finalizeTurn(
    turnId: string,
    type: LlmStreamingControlTurnDone['type'],
  ) {
    const turn = turns.get(turnId)

    if (!turn)
      return

    turn.settle({ type })
    // always delete after settle to prevent stale turn references
    turns.delete(turnId)
  }

  function createTurnApi(
    turnId: string,
    turn: StreamingControlTurnState,
  ): LlmStreamingControlTurn {
    return {
      cancel() {
        finalizeTurn(turnId, 'cancelled')
      },

      complete() {
        finalizeTurn(turnId, 'completed')
      },

      done: turn.done,

      on<TPayload extends Record<string, unknown> = Record<string, unknown>>(
        manifest: LlmStreamingControlCallManifest,
        handler: LlmStreamingControlCallHandler<TPayload>,
      ) {
        return registerHandler<TPayload>(turn, manifest, handler)
      },

      renderManifestPrompt() {
        return renderCallManifestPrompt(
          [...turn.callManifests.values()],
        )
      },

      turnId,
    }
  }

  return {
    beginTurn(options) {
      // crypto UUID avoids collision under concurrency
      const turnId
        = options?.turnId?.trim()
          || createTurnId()

      const existing = turns.get(turnId)

      if (existing)
        return createTurnApi(turnId, existing)

      const turn = createTurnState()

      turns.set(turnId, turn)

      return createTurnApi(turnId, turn)
    },

    cancelTurn(turnId) {
      finalizeTurn(turnId, 'cancelled')
    },

    completeTurn(turnId) {
      finalizeTurn(turnId, 'completed')
    },

    async dispatchWith(special, context) {
      const parser = findParser(special)

      if (!parser) {
        emit(context, {
          reason: 'no-matching-parser',
          type: 'rejected',
        })

        return false
      }

      const parsed = parser.parse(special)

      if (!parsed) {
        emit(context, {
          parserName: parser.name,
          reason: 'parse-failed',
          type: 'rejected',
        })

        return false
      }

      emit(context, {
        callName:
          parsed.type === 'call'
            ? parsed.name
            : undefined,
        parameter: parsedParameter(parsed),
        parserName: parser.name,
        tokenType: parsed.type,
        type: 'parsed',
      })

      const {
        observer: _observer,
        ...dispatchContext
      } = context ?? {}

      const signalContext: LlmStreamingControlSignalContext = {
        ...dispatchContext,
        createdAt: Date.now(),
      }

      // snapshot prevents mutation during iteration
      for (const handler of [...signalHandlers]) {
        try {
          await handler(parsed, signalContext)
        }
        catch (error) {
          emit(context, {
            error,
            tokenType: parsed.type,
            type: 'signal-handler-error',
          })

          console.warn(
            '[llm-streaming-control] signal handler failed',
            error,
          )
        }
      }

      if (parsed.type !== 'call')
        return true

      const turnState = dispatchContext.turnId
        ? turns.get(dispatchContext.turnId)
        : undefined

      const turnHandlers = turnState?.handlers.get(parsed.name)

      const activeHandlers
        = turnHandlers?.size && turnState
          ? turnHandlers
          : handlers.get(parsed.name)

      const registeredHandlers = [
        ...(activeHandlers ?? []),
      ]

      emit(context, {
        count: registeredHandlers.length,
        type: 'call-handler-count',
      })

      if (!registeredHandlers.length) {
        emit(context, {
          callName: parsed.name,
          payload: parsed.payload,
          type: 'call-handler-missing',
        })

        return true
      }

      // preserve sequential execution
      // parallel execution would change semantics
      for (const handler of registeredHandlers) {
        try {
          emit(context, {
            callName: parsed.name,
            type: 'call-handler-start',
          })

          await handler(
            parsed.payload,
            signalContext,
          )

          emit(context, {
            callName: parsed.name,
            type: 'call-handler-end',
          })
        }
        catch (error) {
          emit(context, {
            callName: parsed.name,
            error,
            type: 'call-handler-error',
          })

          console.warn(
            '[llm-streaming-control] handler failed',
            error,
          )
        }
      }

      return true
    },

    match(input) {
      return !!findParser(input)
    },

    on(manifest, handler) {
      return registerHandler(
        {
          callManifests,
          handlers,
        },
        manifest,
        handler,
      )
    },

    onSignal(handler) {
      signalHandlers.add(handler)

      return () => {
        signalHandlers.delete(handler)
      }
    },

    renderManifestPrompt() {
      return renderCallManifestPrompt(
        [...callManifests.values()],
      )
    },
  }
}

function createTurnId() {
  return `turn:${
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }`
}

/**
 * Creates isolated turn state.
 *
 * Notice:
 * - Promise resolves once only
 * - Prevents accidental double completion
 */
function createTurnState(): StreamingControlTurnState {
  let settled = false
  let settle!: (result: LlmStreamingControlTurnDone) => void

  const done = new Promise<LlmStreamingControlTurnDone>((resolve) => {
    settle = (result) => {
      if (settled)
        return

      settled = true
      resolve(result)
    }
  })

  return {
    callManifests: new Map(),
    done,
    handlers: new Map(),
    settle,
  }
}

/**
 * Emits observer events safely.
 *
 * Notice:
 * - Observer failures must never break dispatch
 */
function emit(
  context: Pick<LlmStreamingControlCallContext, 'observer'> | undefined,
  payload: Parameters<NonNullable<LlmStreamingControlCallContext['observer']>>[0],
) {
  try {
    context?.observer?.(payload)
  }
  catch {}
}

/**
 * Normalizes manifest values before registration.
 *
 * Notice:
 * - Empty names/prompts are rejected
 * - Prevents duplicated trim logic
 */
function normalizeManifest(
  manifest: LlmStreamingControlCallManifest,
): LlmStreamingControlCallManifest | undefined {
  const name = manifest.name.trim()
  const prompt = manifest.prompt.trim()

  if (!name || !prompt)
    return

  return {
    ...manifest,
    name,
    prompt,
  }
}

/**
 * Converts parsed signal payload into observer-friendly text.
 *
 * Use when:
 * - Observer logs need a compact human-readable parameter
 *
 * Notice:
 * - Intentionally serializes payloads once
 * - Returns undefined for empty CALL payload
 */
function parsedParameter(signal: LlmStreamingControlSignal): string | undefined {
  switch (signal.type) {
    case 'act':
      return JSON.stringify(signal.payload)

    case 'call':
      return signal.payload != null
        ? JSON.stringify(signal.payload)
        : undefined

    case 'delay':
      return `${signal.seconds}s`
  }
}

/**
 * Registers one CALL handler and returns its disposer.
 *
 * Triggering workflow:
 *
 * {@link createStreamingControlParser}
 *   -> `LlmStreamingControl.on` or `LlmStreamingControlTurn.on`
 *     -> {@link registerHandler}
 *
 * Upstream:
 * - {@link LlmStreamingControl}
 * - {@link LlmStreamingControlTurn}
 *
 * Downstream:
 * - {@link StreamingControlTurnState} handler and manifest registries
 */
function registerHandler<TPayload extends Record<string, unknown>>(
  container: Pick<StreamingControlTurnState, 'callManifests' | 'handlers'>,
  manifest: LlmStreamingControlCallManifest,
  handler: LlmStreamingControlCallHandler<TPayload>,
) {
  const normalized = normalizeManifest(manifest)

  if (!normalized)
    return () => undefined

  let registeredHandlers = container.handlers.get(normalized.name)

  if (!registeredHandlers) {
    registeredHandlers = new Set()
    container.handlers.set(normalized.name, registeredHandlers)
  }

  container.callManifests.set(normalized.name, normalized)

  // The registration API associates each payload type with one opaque CALL name.
  // The runtime registry erases that relation before it looks up the name.
  const registeredHandler = handler as LlmStreamingControlCallHandler
  registeredHandlers.add(registeredHandler)

  return () => {
    registeredHandlers.delete(registeredHandler)

    if (registeredHandlers.size === 0) {
      container.handlers.delete(normalized.name)
      container.callManifests.delete(normalized.name)
    }
  }
}
