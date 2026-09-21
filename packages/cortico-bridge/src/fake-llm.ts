import type { GenerateOptions, Generation, ResponseClient } from 'cortico/core/generation.ts'
import type { ItemOrigin } from 'cortico/protocol/open-responses/context.ts'
import type { Request } from 'cortico/protocol/open-responses/index.ts'

import { unknownMeters } from 'cortico/core/generation.ts'
import { createResponse } from 'cortico/protocol/open-responses/index.ts'

const FAKE_ORIGIN: ItemOrigin = { instance: 'fake', module: 'fake', model: 'fake-model', compatibilityDomain: 'fake' }

function lastUserText(request: Request): string {
  const input = request.input
  if (!Array.isArray(input))
    return ''
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i] as { type?: string, output?: unknown }
    if (item?.type !== 'function_call_output' || typeof item.output !== 'string')
      continue
    const match = item.output.match(/\[[^\]\n]{1,32}\]\s*(.+)/)
    if (match?.[1])
      return match[1].replace(/\s+/g, ' ').slice(0, 80)
  }
  return ''
}
/** The last function_call in the input is an event frame when events were just delivered. */
function lastCallIsEventFrame(request: Request): boolean {
  const input = request.input
  if (!Array.isArray(input))
    return false
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i] as { type?: string, name?: string }
    if (item?.type === 'function_call')
      return item.name === 'external_event_frame'
    if (item?.type !== 'function_call_output')
      return false
  }
  return false
}

/**
 * Deterministic ResponseClient for development without an LLM endpoint.
 *
 * Main loop: if the request already contains tool receipts, end the turn;
 * otherwise speak a canned echo of the last user text and act `happy`.
 * Non-main sessions (forks, dreams) get a short text reply.
 */
export function createFakeLlm(): ResponseClient {
  return {
    respond: async (request: Request, options?: GenerateOptions): Promise<Generation> => {
      const res = createResponse(`resp_fake_${Date.now()}`, request)
      res.status = 'completed'
      res.completed_at = Math.floor(Date.now() / 1000)

      const isMainLoop = options?.role === 'main'
      if (isMainLoop && !lastCallIsEventFrame(request)) {
        res.output = [{
          type: 'function_call',
          id: 'fc_end',
          call_id: 'call_end',
          name: 'end_turn',
          arguments: '{}',
          status: 'completed',
        }]
      }
      else if (isMainLoop) {
        const heard = lastUserText(request)
        res.output = [
          {
            type: 'function_call',
            id: 'fc_speak',
            call_id: 'call_speak',
            name: 'airi_speak',
            arguments: JSON.stringify({ text: `（Cortico 人格核心）收到：${heard || '你好'}` }),
            status: 'completed',
          },
          {
            type: 'function_call',
            id: 'fc_act',
            call_id: 'call_act',
            name: 'airi_act',
            arguments: JSON.stringify({ emotion: 'happy' }),
            status: 'completed',
          },
        ]
      }
      else {
        res.output = [{
          type: 'message',
          id: 'msg_fake',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: '(fake llm reply)', annotations: [] }],
        }]
      }

      res.usage = {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      }
      return {
        response: res,
        origin: FAKE_ORIGIN,
        attempts: [{
          id: 'att_fake',
          generationId: res.id,
          ordinal: 1,
          origin: FAKE_ORIGIN,
          startedAt: new Date().toISOString(),
          elapsedMs: 1,
          requestId: null,
          responseId: res.id,
          outcome: 'completed',
          status: 200,
          serviceTier: null,
          meters: unknownMeters(),
          charges: [],
        }],
      }
    },
  }
}
