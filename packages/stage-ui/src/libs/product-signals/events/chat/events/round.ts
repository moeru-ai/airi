import { defineEvent } from '../../../utils/dsl'

interface ChatRoundProperties {
  conversation_id: string
  round_id: string
  turn_index: number
}

export const messageRoundEvent = defineEvent<ChatRoundProperties & {
  duration_ms: number
  has_voice: boolean
  model: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  usage_source?: 'reported' | 'estimated' | 'unavailable'
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_flow_result'
}>('message_round')

export const messageRoundFailedEvent = defineEvent<ChatRoundProperties & {
  provider_id: string
  model_id: string
  source: 'text' | 'voice'
  error_code?: string
  failure_stage?: string
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_flow_result'
}>('message_round_failed')
