import type {
  LlmStreamingControl,
  LlmStreamingControlCallContext,
  LlmStreamingControlCallHandler,
  LlmStreamingControlCallManifest,
  LlmStreamingControlOptions,
  LlmStreamingControlSignal,
  LlmStreamingControlSignalContext,
  LlmStreamingControlSignalHandler,
  LlmStreamingControlTurnDone,
} from './types'

import { tokenAct, tokenCall, tokenDelay } from './parsers'
import { renderCallManifestPrompt } from './parsers/call'

interface StreamingControlTurnState {
  handlers: Map<string, Set<LlmStreamingControlCallHandler>>
  callManifests: Map<string, LlmStreamingControlCallManifest>
  settle: (result: LlmStreamingControlTurnDone) => void
  done: Promise<LlmStreamingControlTurnDone>
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

function createTurnId() {
  return `turn:${
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }`
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
    handlers: new Map(),
    callManifests: new Map(),
    settle,
    done,
  }
}

/**
 * Registers handler and keeps cleanup centralized.
 *
 * Notice:
 * - Avoid duplicated Map allocations
 * - Removes manifest automatically once empty
 */
function registerHandler<TPayload extends Record<string, unknown>>(
  container: Pick<StreamingControlTurnState, 'handlers' | 'callManifests'>,
  manifest: LlmStreamingControlCallManifest,
  handler: LlmStreamingControlCallHandler<TPayload>,
) {
  const normalized = normalizeManifest(manifest)

  if (!normalized)
    return () => undefined

  let set = container.handlers.get(normalized.name)

  if (!set) {
    set = new Set()
    container.handlers.set(normalized.name, set)
  }

  container.callManifests.set(normalized.name, normalized)

  set.add(handler as LlmStreamingControlCallHandler)

  return () => {
    set!.delete(handler)

    if (set!.size === 0) {
      container.handlers.delete(normalized.name)
      container.callManifests.delete(normalized.name)
    }
  }
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
  ) {
    return {
      turnId,

      on<TPayload extends Record<string, unknown> = Record<string, unknown>>(manifest, handler) {
        return registerHandler<TPayload>(turn, manifest, handler)
      },

      renderManifestPrompt() {
        return renderCallManifestPrompt(
          [...turn.callManifests.values()],
        )
      },

      complete() {
        finalizeTurn(turnId, 'completed')
      },

      cancel() {
        finalizeTurn(turnId, 'cancelled')
      },

      done: turn.done,
    }
  }

  return {
    match(input) {
      return !!findParser(input)
    },

    async dispatchWith(special, context) {
      const parser = findParser(special)

      if (!parser) {
        emit(context, {
          type: 'rejected',
          reason: 'no-matching-parser',
        })

        return false
      }

      const parsed = parser.parse(special)

      if (!parsed) {
        emit(context, {
          type: 'rejected',
          reason: 'parse-failed',
          parserName: parser.name,
        })

        return false
      }

      emit(context, {
        type: 'parsed',
        parserName: parser.name,
        tokenType: parsed.type,
        callName:
          parsed.type === 'call'
            ? parsed.name
            : undefined,
        parameter: parsedParameter(parsed),
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
            type: 'signal-handler-error',
            tokenType: parsed.type,
            error,
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
        type: 'call-handler-count',
        count: registeredHandlers.length,
      })

      if (!registeredHandlers.length) {
        emit(context, {
          type: 'call-handler-missing',
          callName: parsed.name,
          payload: parsed.payload,
        })

        return true
      }

      // preserve sequential execution
      // parallel execution would change semantics
      for (const handler of registeredHandlers) {
        try {
          emit(context, {
            type: 'call-handler-start',
            callName: parsed.name,
          })

          await handler(
            parsed.payload,
            signalContext,
          )

          emit(context, {
            type: 'call-handler-end',
            callName: parsed.name,
          })
        }
        catch (error) {
          emit(context, {
            type: 'call-handler-error',
            callName: parsed.name,
            error,
          })

          console.warn(
            '[llm-streaming-control] handler failed',
            error,
          )
        }
      }

      return true
    },

    on(manifest, handler) {
      return registerHandler(
        {
          handlers,
          callManifests,
        },
        manifest,
        handler,
      )
    },

    renderManifestPrompt() {
      return renderCallManifestPrompt(
        [...callManifests.values()],
      )
    },

    onSignal(handler) {
      signalHandlers.add(handler)

      return () => {
        signalHandlers.delete(handler)
      }
    },

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

    completeTurn(turnId) {
      finalizeTurn(turnId, 'completed')
    },

    cancelTurn(turnId) {
      finalizeTurn(turnId, 'cancelled')
    },
  }
}
