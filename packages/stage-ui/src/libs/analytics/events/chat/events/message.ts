import { defineEvent } from '../../../utils/dsl'

export const messageSentEvent = defineEvent<{
  conversation_id: string
  provider_type: 'official' | 'custom' | 'unknown'
  provider_name: string
  model: string
  message_id: string
  round_id: string
  turn_index: number
  message_index: number
  message_length: number
  has_attachment: boolean
  mode: 'text' | 'voice'
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_action'
}>('message_sent')
