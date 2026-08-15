import { defineEvent } from '../../../utils/dsl'

interface ChatRoundProperties {
  conversation_id: string
  round_id: string
  turn_index: number
}

export const messageSendStartedEvent = defineEvent<ChatRoundProperties & {
  source: 'text' | 'voice'
  model?: string
}>('message_send_started')

export const llmRequestStartedEvent = defineEvent<ChatRoundProperties & {
  model: string
  provider: string
  has_voice: boolean
}>('llm_request_started')

export const llmFirstTokenEvent = defineEvent<ChatRoundProperties & {
  model: string
  ttfb_ms: number
}>('llm_first_token')

export const llmRetryAttemptEvent = defineEvent<ChatRoundProperties & {
  model: string
  provider: string
  /** 1-based index of the retry that is about to run. */
  attempt: number
  delay_ms: number
  /** Coarse cause bucket the retry decision was based on, e.g. `rate-limited`, `server`, `network`. */
  reason: string
}>('llm_retry_attempt')

export const assistantResponseRenderedEvent = defineEvent<ChatRoundProperties & {
  model: string
  latency_ms: number
}>('assistant_response_rendered')

export const messageRoundEvent = defineEvent<ChatRoundProperties & {
  duration_ms: number
  has_voice: boolean
  model: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  usage_source?: 'reported' | 'estimated' | 'unavailable'
}>('message_round')

export const messageRoundFailedEvent = defineEvent<ChatRoundProperties & {
  provider_id: string
  model_id: string
  source: 'text' | 'voice'
  error_code?: string
  failure_stage?: string
}>('message_round_failed')
