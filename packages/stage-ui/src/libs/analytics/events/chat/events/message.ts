import { defineEvent } from '../../../utils/dsl'

export const messageSentEvent = defineEvent<{
  conversation_id: string
  has_attachment: boolean
  message_id: string
  message_index: number
  message_length: number
  mode: 'text' | 'voice'
  model: string
  provider_name: string
  provider_type: 'custom' | 'official' | 'unknown'
  round_id: string
  trigger_method: 'text_input' | 'voice'
  trigger_type: 'user_action'
  turn_index: number
}>('message_sent')
