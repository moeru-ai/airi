import { defineEvent } from '../../../utils/dsl'

interface ChatRoundProperties {
  conversation_id: string
  round_id: string
  turn_index: number
}

export const messageRoundEvent = defineEvent<ChatRoundProperties & {
  duration_ms: number
  has_voice: boolean
  input_tokens?: number
  model: string
  output_tokens?: number
  total_tokens?: number
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_flow_result'
  usage_source?: 'estimated' | 'reported' | 'unavailable'
}>('message_round')

export const messageRoundFailedEvent = defineEvent<ChatRoundProperties & {
  error_code?: string
  failure_stage?: string
  model_id: string
  provider_id: string
  source: 'text' | 'voice'
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_flow_result'
}>('message_round_failed')
