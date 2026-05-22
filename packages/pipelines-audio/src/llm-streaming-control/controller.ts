import type {
  LlmStreamingControl,
  LlmStreamingControlCallContext,
  LlmStreamingControlCallHandler,
  LlmStreamingControlCallManifest,
  LlmStreamingControlOptions,
  LlmStreamingControlSignal,
  LlmStreamingControlSignalHandler,
  LlmStreamingControlTurnDone,
} from './types'

import { tokenAct, tokenCall, tokenDelay } from './parsers'
import { renderCallManifestPrompt } from './parsers/call'

function parsedParameter(signal: LlmStreamingControlSignal): string | undefined {
  switch (signal.type) {
    case 'act':
      return JSON.stringify(signal.payload)
    case 'call':
      return signal.payload ? JSON.stringify(signal.payload) : undefined
    case 'delay':
      return `${signal.seconds}s`
  }
}

interface StreamingControlTurnState {
  handlers: Map<string, Set<LlmStreamingControlCallHandler>>
  callManifests: Map<string, LlmStreamingControlCallManifest>
  settle: (result: LlmStreamingControlTurnDone) => void
  done: Promise<LlmStreamingControlTurnDone>
}

/**
 * Creates a controller over LLM streaming-control tokens.
 *
 * Use when:
 * - A stage runtime needs to dispatch special tokens from one playback source
 * - A plugin bridge needs to register CALL callbacks against the same controller instance
 *
 * Expects:
 * - The caller owns the controller lifetime, usually through a Pinia store
 *
 * Returns:
 * - A controller with `match`, `dispatchWith`, and `on`
 */
export function createStreamingControlParser(options: LlmStreamingControlOptions = {}): LlmStreamingControl {
  const handlers = new Map<string, Set<LlmStreamingControlCallHandler>>()
  const callManifests = new Map<string, LlmStreamingControlCallManifest>()
  const turns = new Map<string, StreamingControlTurnState>()
  const signalHandlers = new Set<LlmStreamingControlSignalHandler>()
  const parsers = options.parsers ?? [
    tokenAct(),
    tokenDelay(),
    tokenCall(),
  ]

  return {
    match(special) {
      return parsers.some(parser => parser.match(special))
    },
    async dispatchWith(special, context) {
      const parser = parsers.find(item => item.match(special))
      if (!parser) {
        context?.observer?.({ type: 'rejected', reason: 'no-matching-parser' })
        return false
      }

      const parsed = parser.parse(special)
      if (!parsed) {
        context?.observer?.({ type: 'rejected', reason: 'parse-failed', parserName: parser.name })
        return false
      }

      context?.observer?.({
        type: 'parsed',
        parserName: parser.name,
        tokenType: parsed.type,
        callName: parsed.type === 'call' ? parsed.name : undefined,
        parameter: parsedParameter(parsed),
      })

      const { observer: _observer, ...dispatchContext } = context ?? {}
      const signalContext: LlmStreamingControlCallContext = { ...dispatchContext, createdAt: Date.now() }

      for (const handler of signalHandlers) {
        try {
          await handler(parsed, signalContext)
        }
        catch (error) {
          context?.observer?.({ type: 'signal-handler-error', tokenType: parsed.type, error })
          console.warn('[llm-streaming-control] signal handler failed', error)
        }
      }
      if (parsed.type !== 'call') {
        return true
      }

      const turnHandlers = dispatchContext.turnId
        ? turns.get(dispatchContext.turnId)?.handlers.get(parsed.name)
        : undefined
      const globalHandlers = handlers.get(parsed.name)
      const registeredHandlers = turnHandlers?.size
        ? [...turnHandlers]
        : [...(globalHandlers ?? [])]

      context?.observer?.({ type: 'call-handler-count', count: registeredHandlers.length })
      if (!registeredHandlers.length) {
        context?.observer?.({ type: 'call-handler-missing', callName: parsed.name, payload: parsed.payload })
        return true
      }

      for (const handler of registeredHandlers) {
        try {
          context?.observer?.({ type: 'call-handler-start', callName: parsed.name })
          await handler(parsed.payload, signalContext)
          context?.observer?.({ type: 'call-handler-end', callName: parsed.name })
        }
        catch (error) {
          context?.observer?.({ type: 'call-handler-error', callName: parsed.name, error })
          console.warn('[llm-streaming-control] handler failed', error)
        }
      }

      return true
    },
    on(manifest, handler) {
      const normalizedName = manifest.name.trim()
      const normalizedPrompt = manifest.prompt.trim()

      if (!normalizedName || !normalizedPrompt) {
        return () => undefined
      }

      callManifests.set(normalizedName, {
        ...manifest,
        name: normalizedName,
        prompt: normalizedPrompt,
      })

      const registeredHandlers = handlers.get(normalizedName) ?? new Set<LlmStreamingControlCallHandler>()
      registeredHandlers.add(handler as LlmStreamingControlCallHandler)
      handlers.set(normalizedName, registeredHandlers)

      return () => {
        registeredHandlers.delete(handler as LlmStreamingControlCallHandler)

        if (registeredHandlers.size === 0) {
          handlers.delete(normalizedName)
          callManifests.delete(normalizedName)
        }
      }
    },
    renderManifestPrompt() {
      return renderCallManifestPrompt([...callManifests.values()])
    },
    onSignal(handler) {
      signalHandlers.add(handler)

      return () => {
        signalHandlers.delete(handler)
      }
    },
    beginTurn(options) {
      const turnId = options?.turnId?.trim() || `turn:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      const existing = turns.get(turnId)
      if (existing) {
        return {
          turnId,
          on(manifest, handler) {
            return registerTurnHandler(existing, manifest, handler as LlmStreamingControlCallHandler)
          },
          renderManifestPrompt() {
            return renderCallManifestPrompt([...existing.callManifests.values()])
          },
          complete() {
            existing.settle({ type: 'completed' })
            turns.delete(turnId)
          },
          cancel() {
            existing.settle({ type: 'cancelled' })
            turns.delete(turnId)
          },
          done: existing.done,
        }
      }

      let settle!: (result: LlmStreamingControlTurnDone) => void
      let settled = false
      const done = new Promise<LlmStreamingControlTurnDone>((resolve) => {
        settle = (result) => {
          if (settled)
            return
          settled = true
          resolve(result)
        }
      })
      const turn = {
        handlers: new Map<string, Set<LlmStreamingControlCallHandler>>(),
        callManifests: new Map<string, LlmStreamingControlCallManifest>(),
        settle,
        done,
      }
      turns.set(turnId, turn)

      return {
        turnId,
        on(manifest, handler) {
          return registerTurnHandler(turn, manifest, handler as LlmStreamingControlCallHandler)
        },
        renderManifestPrompt() {
          return renderCallManifestPrompt([...turn.callManifests.values()])
        },
        complete() {
          settle({ type: 'completed' })
          turns.delete(turnId)
        },
        cancel() {
          settle({ type: 'cancelled' })
          turns.delete(turnId)
        },
        done,
      }
    },
    completeTurn(turnId) {
      const turn = turns.get(turnId)
      if (!turn)
        return
      turn.settle({ type: 'completed' })
      turns.delete(turnId)
    },
    cancelTurn(turnId) {
      const turn = turns.get(turnId)
      if (!turn)
        return
      turn.settle({ type: 'cancelled' })
      turns.delete(turnId)
    },
  }

  function registerTurnHandler(
    turn: Pick<StreamingControlTurnState, 'handlers' | 'callManifests'>,
    manifest: LlmStreamingControlCallManifest,
    handler: LlmStreamingControlCallHandler,
  ) {
    const normalizedName = manifest.name.trim()
    const normalizedPrompt = manifest.prompt.trim()
    if (!normalizedName || !normalizedPrompt) {
      return () => undefined
    }

    turn.callManifests.set(normalizedName, { ...manifest, name: normalizedName, prompt: normalizedPrompt })
    const registeredHandlers = turn.handlers.get(normalizedName) ?? new Set<LlmStreamingControlCallHandler>()
    registeredHandlers.add(handler)
    turn.handlers.set(normalizedName, registeredHandlers)

    return () => {
      registeredHandlers.delete(handler)
      if (registeredHandlers.size === 0) {
        turn.handlers.delete(normalizedName)
        turn.callManifests.delete(normalizedName)
      }
    }
  }
}
