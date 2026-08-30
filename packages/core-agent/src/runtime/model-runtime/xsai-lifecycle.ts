import type { Event, Message, Usage } from '@xsai/shared-chat'

import type { StreamEvent, StreamOptions } from '../../types/llm'

import { errorMessageFromValue } from '../../utils/error-message'
import { redactSecretText } from './errors'

function logStreamDiagnostic(label: string, error: unknown): void {
  console.error(label, redactSecretText(errorMessageFromValue(error)))
}

/**
 * Maps xsAI stream events onto the AIRI {@link StreamEvent} contract.
 *
 * xsAI 0.5.0-beta.8 marks failed tool executions with `isError: true` on
 * `tool-result.done` instead of aborting the stream, so AIRI can distinguish
 * `tool-error` from `tool-result` directly from the event payload.
 */
export function toAiriStreamEvent(event: Event): StreamEvent | null {
  switch (event.type) {
    case 'text.delta':
      return { type: 'text-delta', text: event.delta }
    case 'reasoning.delta':
      return { type: 'reasoning-delta', text: event.delta }
    case 'tool-call.done':
      return { ...event, type: 'tool-call' }
    case 'tool-result.done':
      if (event.isError === true)
        return { ...event, type: 'tool-error', isError: true }
      return {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        result: typeof event.result === 'string' || Array.isArray(event.result)
          ? event.result
          : JSON.stringify(event.result),
      }
    case 'error':
      return {
        type: 'error',
        error: event.cause ?? new Error(event.message),
      }
    case 'text.start':
    case 'text.done':
    case 'reasoning.start':
    case 'reasoning.done':
    case 'step.start':
    case 'step.done':
    case 'tool-call.start':
    case 'tool-call.delta':
      return null
    default:
      return null
  }
}

/**
 * xsAI stream promises consumed by AIRI generation.
 */
export interface XsAiLifecycleResult {
  steps: Promise<unknown>
  messages?: Promise<Message[]>
  usage: Promise<unknown>
  totalUsage: Promise<Usage | undefined>
}

/**
 * Runs an xsAI stream factory and waits for AIRI finish and usage events.
 *
 * `steps` is the authoritative completion signal, including tool-call rounds.
 * Late provider error events after `steps` resolve are ignored.
 */
export function runXsAiGeneration(
  start: (onEvent: (event: Event) => Promise<void>) => XsAiLifecycleResult,
  options?: StreamOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let stepsSettled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (error: unknown) => {
      if (settled || stepsSettled)
        return
      settled = true
      reject(error)
    }

    const onEvent = async (event: Event) => {
      try {
        const streamEvent = toAiriStreamEvent(event)
        if (streamEvent != null)
          await options?.onStreamEvent?.(streamEvent)
        if (streamEvent?.type === 'error')
          rejectOnce(streamEvent.error)
      }
      catch (error) {
        rejectOnce(error)
      }
    }

    try {
      const streamResult = start(onEvent)

      // NOTICE: Consume underlying promises to prevent unhandled rejections from
      // @xsai/stream-text's SSE parser surfacing as faulted app state.
      // NOTICE:
      // `streamText(...).steps` is the authoritative completion signal for the
      // full streamed interaction, including tool-call rounds.
      // Resolving only from `onEvent({ type: 'finish' })` is incorrect when
      // `options?.waitForTools === true`, because providers can emit
      // `finishReason: 'tool_calls'` or `finishReason: 'tool-calls'` before the
      // tool round has fully settled.
      // That misuse leaves the outer promise pending, which makes provider-backed
      // eval tasks look like they stop mid-run and prevents later scheduled evals
      // from starting.
      // Keep `steps.then(resolveOnce)` so evaluation runners observe the real end
      // of the stream lifecycle instead of an intermediate tool boundary.
      void streamResult.steps.then(async () => {
        // Ignore any late provider error event emitted after xsAI has already
        // resolved the authoritative full-step lifecycle.
        stepsSettled = true
        try {
          if (streamResult.messages) {
            const finalMessages = await streamResult.messages
            await options?.onMessages?.(finalMessages)
          }
        }
        catch (error) {
          // Transcript persistence is part of the completed response contract,
          // unlike late provider events and optional usage observation.
          if (!settled) {
            settled = true
            reject(error)
          }
          return
        }
        try {
          await options?.onStreamEvent?.({ type: 'finish' } as const)
        }
        catch (error) {
          // The finish listener runs after steps settled, so rejectOnce would
          // ignore this error as a "late provider event". A listener failure
          // is still a real failure and must reject the outer promise.
          if (!settled) {
            settled = true
            reject(error)
          }
          return
        }
        let usage: Usage | undefined
        try {
          usage = await streamResult.totalUsage
        }
        catch (error) {
          logStreamDiagnostic('Stream totalUsage error:', error)
        }
        try {
          const normalizedUsage = !usage
            || (usage.inputTokens == null && usage.outputTokens == null && usage.totalTokens == null)
            ? { source: 'unavailable' as const }
            : { ...usage, source: 'reported' as const }
          await options?.onUsage?.(normalizedUsage)
        }
        catch (error) {
          // Usage observers are telemetry-only and must not turn a completed
          // provider response into a failed user message.
          logStreamDiagnostic('Stream usage callback error:', error)
        }
        resolveOnce()
      }).catch((error) => {
        // A failure after `steps` resolved belongs to optional usage
        // observation and cannot invalidate the completed response.
        if (stepsSettled) {
          logStreamDiagnostic('Stream usage observation error:', error)
          resolveOnce()
          return
        }
        rejectOnce(error)
        logStreamDiagnostic('Stream steps error:', error)
      })
      // `steps` can reject before the success path awaits `messages`.
      // Keep this rejection sink so xsAI cannot create an unhandled rejection.
      void streamResult.messages?.catch(error => logStreamDiagnostic('Stream messages error:', error))
      void streamResult.usage.catch(error => logStreamDiagnostic('Stream usage error:', error))
      // `steps` and `totalUsage` reject independently when xsAI fails a
      // stream. The success path awaits `totalUsage`, but if `steps` rejects
      // first that await never runs, so keep this unconditional rejection sink.
      void streamResult.totalUsage.catch(error => logStreamDiagnostic('Stream totalUsage error:', error))
    }
    catch (error) {
      rejectOnce(error)
    }
  })
}
