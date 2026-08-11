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
}>('message_sent')

export const secondTurnStartedEvent = defineEvent<{
  conversation_id: string
  provider_mode: 'official' | 'custom' | 'unknown'
  provider_id: string
  model_id: string
  round_id: string
  source: 'text' | 'voice'
  turn_index: number
}>('second_turn_started')
