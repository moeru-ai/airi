import type { InferOutput } from 'valibot'

import type { AiGenerationAppSurface } from '../../../../services/domain/product-events'
import type { GatewayCallback } from '../gateway'
import type { V1RouteDeps } from '../types'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { EventSourceParserStream } from '@xsai/shared-stream'
import { array, boolean, integer, literal, looseObject, minValue, nonEmpty, null_, nullable, number, object, optional, picklist, pipe, safeParse, strictObject, string, union, unknown } from 'valibot'

import { createBadRequestError } from '../../../../utils/error'
import { nanoid } from '../../../../utils/id'
import { buildSafeErrorResponseHeaders } from '../http/response'
import { createOpenAiRouteBilling } from '../middlewares/billing'
import { createRouteTelemetry } from '../middlewares/telemetry'
import { resolveModelAliasPlan, routeModelAliasCandidates } from '../model-routing'

const textPart = object({ type: literal('input_text'), text: string() })
const imagePart = object({ type: literal('input_image'), image_url: string(), detail: optional(picklist(['auto', 'low', 'high', 'original'])) })
const filePart = object({ type: literal('input_file'), file_data: optional(string()), filename: optional(string()), file_url: optional(string()) })
const outputPart = looseObject({ type: picklist(['output_text', 'refusal']) })
const content = union([string(), array(union([textPart, imagePart, filePart, outputPart]))])
const item = union([
  looseObject({ type: optional(literal('message'), 'message'), role: picklist(['user', 'system', 'developer', 'assistant']), content }),
  looseObject({ type: literal('compaction'), encrypted_content: string() }),
  looseObject({ type: literal('reasoning'), summary: array(unknown()), encrypted_content: optional(nullable(string())) }),
  looseObject({ type: literal('function_call'), call_id: string(), name: string(), arguments: string() }),
  looseObject({ type: literal('function_call_output'), call_id: string(), output: content }),
])
const requestSchema = strictObject({
  model: optional(pipe(string(), nonEmpty()), 'auto'),
  input: union([string(), array(item)]),
  stream: optional(boolean(), false),
  // Gateway credentials belong to a shared upstream account. Complete Items
  // are replayed by the client; opaque provider-side state is never accepted.
  store: optional(literal(false), false),
  background: optional(literal(false)),
  previous_response_id: optional(null_()),
  conversation: optional(null_()),
  instructions: optional(string()),
  tools: optional(array(looseObject({ type: literal('function'), name: string(), parameters: nullable(looseObject({})), strict: optional(nullable(boolean())), description: optional(nullable(string())) }))),
  tool_choice: optional(union([picklist(['auto', 'none', 'required']), looseObject({ type: picklist(['function', 'allowed_tools']) })])),
  reasoning: optional(looseObject({ effort: optional(string()), summary: optional(string()) })),
  text: optional(looseObject({})),
  include: optional(array(picklist(['reasoning.encrypted_content', 'message.output_text.logprobs']))),
  max_output_tokens: optional(pipe(number(), integer(), minValue(1))),
  temperature: optional(number()),
  top_p: optional(number()),
  parallel_tool_calls: optional(boolean()),
  truncation: optional(picklist(['auto', 'disabled'])),
})
const tokens = pipe(number(), integer(), minValue(0))
const responseSchema = looseObject({
  id: string(),
  status: picklist(['completed', 'failed', 'incomplete', 'in_progress', 'queued', 'cancelled']),
  output: array(unknown()),
  usage: optional(nullable(object({ input_tokens: tokens, output_tokens: tokens, total_tokens: tokens }))),
})
const eventSchema = looseObject({ type: string() })

/** Validated input for one stateless Responses create request. */
export interface ResponsesOperationRequest {
  userId: string
  body: InferOutput<typeof requestSchema>
  sessionId?: string
  roundId?: string
  appSurface?: AiGenerationAppSurface
  abortSignal?: AbortSignal
}

/** Validates supported create fields before forwarding shared gateway credentials. */
export function parseResponsesRequest(value: unknown): InferOutput<typeof requestSchema> {
  const parsed = safeParse(requestSchema, value)
  if (!parsed.success)
    throw createBadRequestError('Invalid stateless Responses request', 'INVALID_RESPONSES_REQUEST', { issues: parsed.issues.map(issue => issue.message) })
  return parsed.output
}

/**
 * Routes native Responses creation and settles completed requests through Flux.
 * Each HTTP request owns one request id and one terminal transition. SSE EOF,
 * provider failure and cancellation cannot trigger a debit or an upstream retry.
 */
export function responsesCreate(deps: V1RouteDeps): GatewayCallback<'responses.create'> {
  const billing = createOpenAiRouteBilling(deps)
  const logger = useLogger('v1-responses').useGlobalConfig()
  const telemetry = createRouteTelemetry(deps)
  return async ({ input }) => {
    const requestId = nanoid()
    const startedAt = Date.now()
    const policy = await billing.authorizeChat(input.userId)
    const alias = await resolveModelAliasPlan(deps, input.body.model)
    const routed = await routeModelAliasCandidates({ deps, body: input.body, modelIds: alias.modelIds, protocol: 'responses', abortSignal: input.abortSignal })
    const upstream = routed.response
    if (!upstream.ok)
      return new Response(upstream.body, { status: upstream.status, headers: buildSafeErrorResponseHeaders(upstream) })

    const trace = deps.llmTracing.startChatGeneration({
      protocol: 'responses',
      input: input.body.input,
      model: routed.routeCtx.upstreamModel ?? routed.modelId,
      requestId,
      stream: input.body.stream,
      userId: input.userId,
      sessionId: input.sessionId,
    })
    // The closure guards duplicate terminal frames and late reader failures.
    let terminal = false
    async function complete(value: unknown) {
      const parsed = safeParse(responseSchema, value)
      if (!parsed.success)
        throw new Error('Invalid Responses terminal payload')
      const response = parsed.output
      if (terminal)
        throw new Error('Duplicate Responses terminal event')
      terminal = true
      if (response.status !== 'completed') {
        trace.fail(`Responses request ${response.status}`)
        return
      }
      const usage = { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens }
      const amount = billing.priceChatUsage(usage, policy)
      let charged = 0
      try {
        charged = await billing.settleChat({
          ...usage,
          userId: input.userId,
          requestId,
          model: routed.modelId,
          amount,
          stage: input.body.stream ? 'streaming' : 'non_streaming',
          logger,
        })
      }
      catch (error) {
        billing.recordChatDebitFailure({ amount, model: routed.modelId, stage: input.body.stream ? 'streaming' : 'non_streaming' })
        logger.withFields({ requestId, error: errorMessageFrom(error) }).error('Responses debit failed')
      }
      trace.succeed({ ...usage, output: response.output, fluxConsumed: charged })
      const durationMs = Date.now() - startedAt
      telemetry.recordMetrics({ ...usage, model: routed.modelId, status: 200, type: 'responses', provider: routed.routeCtx.provider, durationMs, fluxConsumed: charged })
      telemetry.recordRequestLog({ ...usage, userId: input.userId, model: routed.modelId, status: 200, durationMs, fluxConsumed: charged })
      deps.productEventService.trackGeneration({
        userId: input.userId,
        traceId: input.sessionId ?? requestId,
        generationId: input.roundId ?? requestId,
        model: routed.routeCtx.upstreamModel ?? routed.modelId,
        provider: routed.routeCtx.provider,
        providerType: 'official',
        usageSource: response.usage ? 'reported' : 'unavailable',
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: response.usage?.total_tokens,
        costUsdSource: 'unavailable',
        conversationId: input.sessionId ?? requestId,
        conversationIdSource: input.sessionId ? 'client_header' : 'server_request',
        roundId: input.roundId ?? requestId,
        ...(input.appSurface && { appSurface: input.appSurface }),
        captureSurface: 'server',
        latencySeconds: durationMs / 1000,
        stream: input.body.stream,
      })
    }

    if (!input.body.stream) {
      try {
        const value: unknown = await upstream.json()
        await complete(value)
        return Response.json(value)
      }
      catch (error) {
        trace.fail('Invalid Responses JSON response')
        throw error
      }
    }

    if (!upstream.body)
      throw new Error('Responses stream has no body')
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader()
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    const cancel = () => {
      void reader.cancel(input.abortSignal?.reason).catch(() => {})
    }
    input.abortSignal?.addEventListener('abort', cancel, { once: true })
    // A downstream cancellation rejects writer.closed even while read() waits.
    void writer.closed.catch(cancel)
    void (async () => {
      try {
        while (true) {
          input.abortSignal?.throwIfAborted()
          const { done, value } = await reader.read()
          input.abortSignal?.throwIfAborted()
          if (done)
            throw new Error('Responses stream ended before a terminal event')
          if (!value.data)
            continue
          const event = safeParse(eventSchema, JSON.parse(value.data))
          if (!event.success)
            throw new Error('Invalid Responses SSE event')
          const type = event.output.type
          const isTerminal = ['response.completed', 'response.failed', 'response.incomplete'].includes(type)
          // Keep the provider JSON and SSE event name intact. Reframing complete
          // events handles UTF-8 and transport splits without tail-buffer limits.
          if (isTerminal) {
            const response = safeParse(responseSchema, event.output.response)
            if (!response.success || type !== `response.${response.output.status}`)
              throw new Error('Responses terminal status does not match its event')
            await complete(response.output)
          }
          else if (type === 'error') {
            terminal = true
            trace.fail('Responses stream error')
          }
          await writer.write(encoder.encode(`${value.event ? `event: ${value.event}\n` : ''}${value.id ? `id: ${value.id}\n` : ''}data: ${value.data.replaceAll('\n', '\ndata: ')}\n\n`))
          if (terminal) {
            await writer.close()
            return
          }
        }
      }
      catch (error) {
        if (!terminal)
          trace.fail(errorMessageFrom(error) ?? 'Responses stream interrupted')
        await writer.abort(error).catch(() => {})
      }
      finally {
        input.abortSignal?.removeEventListener('abort', cancel)
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    })()
    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  }
}
