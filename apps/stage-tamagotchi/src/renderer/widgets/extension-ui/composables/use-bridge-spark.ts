import type { SparkNotifyPerformanceResult, SparkNotifyReactionOptions } from '@proj-airi/stage-ui/stores/mods/api/spark-notify-reaction'

import { widgetsIframeBroadcastEvent } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import { sparkNotifyReactionOptionsSchema } from '@proj-airi/stage-ui/stores/mods/api/spark-notify-reaction'
import { array, finite, looseObject, nonEmpty, number, optional, pipe, record, safeParse, string, trim, unknown } from 'valibot'

interface PublishWidgetSparkNotifyReactionOptions {
  dispatchSparkNotifyPerformance?: (options: SparkNotifyReactionOptions) => Promise<SparkNotifyPerformanceResult>
  dispatchSparkNotifyReaction: (options: SparkNotifyReactionOptions) => Promise<string>
  emit: (event: typeof widgetsIframeBroadcastEvent, payload: Record<string, unknown>) => void
}

const widgetSparkNotifyEventSchema = looseObject({
  // `payload` carries the domain request for this route. For spark messages,
  // the host turns `sparkNotify` into a stage-ui reaction request and sends the
  // resulting text back over `responseRoute`.
  payload: looseObject({
    calls: optional(array(looseObject({
      examples: optional(array(string())),
      name: pipe(string(), trim(), nonEmpty()),
      prompt: pipe(string(), trim(), nonEmpty()),
    }))),
    // Deterministic response text used when the spark reaction path fails,
    // times out, or returns an empty reaction. The iframe chooses this value
    // because it owns the user-facing fallback for its current UI state.
    fallbackResponseText: string(),
    // Correlation key owned by the iframe caller. It is not a trace/event id:
    // the host only echoes it so the iframe can resolve the matching pending
    // request when multiple commentary requests are in flight.
    requestId: optional(string()),
    responseRoute: optional(record(string(), unknown())),
    sparkNotify: looseObject({}),
    timeoutMs: optional(pipe(number(), finite())),
  }),
  // `route` is the iframe-local delivery key for this publish envelope.
  // It is not a chat topic. The namespace lets the host derive a default
  // response route without knowing chess/commentary-specific route names.
  route: optional(looseObject({
    namespace: optional(pipe(string(), trim(), nonEmpty())),
  })),
})

/**
 * Handles iframe-published spark notify requests and broadcasts the generated reaction.
 *
 * Use when:
 * - A plugin widget iframe asks the stage renderer to produce character-facing commentary
 * - The widget needs a correlated response over the existing iframe broadcast channel
 *
 * Expects:
 * - `event.payload.sparkNotify.headline` is a non-empty string
 * - `event.payload.fallbackResponseText` is a string; empty fallback is allowed for silent phases
 * - `dispatchSparkNotifyReaction` is backed by the stage context bridge store
 *
 * Returns:
 * - `true` when the iframe event was handled as a spark notify request
 * - `false` when callers should continue their normal iframe publish flow
 */
export async function publishWidgetSparkNotifyReaction(
  event: Record<string, unknown>,
  options: PublishWidgetSparkNotifyReactionOptions,
): Promise<boolean> {
  const request = createSparkNotifyReactionOptions(event)
  if (!request) {
    return false
  }

  const widgetCallManifests = request.calls ?? []
  const performance = widgetCallManifests.length > 0 && options.dispatchSparkNotifyPerformance
    ? await options.dispatchSparkNotifyPerformance({
        ...request.reactionOptions,
        calls: widgetCallManifests.map(manifest => ({
          handler: async () => undefined,
          manifest,
        })),
        timeoutMs: request.timeoutMs,
      })
    : undefined

  const text = performance
    ? performance.reaction
    : await options.dispatchSparkNotifyReaction(request.reactionOptions)

  options.emit(widgetsIframeBroadcastEvent, {
    payload: {
      ...(request.requestId ? { requestId: request.requestId } : {}),
      text,
      ...(performance
        ? {
            performance: {
              name: performance.name,
              type: performance.type,
            },
          }
        : {}),
    },
    route: request.responseRoute,
  })

  return true
}

function createSparkNotifyReactionOptions(event: Record<string, unknown>) {
  const result = safeParse(widgetSparkNotifyEventSchema, event)
  if (!result.success) {
    return undefined
  }

  const { payload, route } = result.output
  const responseRoute = payload.responseRoute ?? (route?.namespace
    ? {
        name: 'response',
        namespace: route.namespace,
      }
    : undefined)
  if (!responseRoute) {
    return undefined
  }
  const reactionOptionsResult = safeParse(sparkNotifyReactionOptionsSchema, {
    ...payload.sparkNotify,
    fallbackResponseText: payload.fallbackResponseText,
  })
  if (!reactionOptionsResult.success) {
    return undefined
  }

  return {
    calls: payload.calls,
    reactionOptions: reactionOptionsResult.output satisfies SparkNotifyReactionOptions,
    requestId: payload.requestId,
    responseRoute,
    timeoutMs: payload.timeoutMs,
  }
}
