import { defineEvent } from '../../../utils/dsl'

interface ChatActivationProperties {
  conversation_id: string
  round_id: string
  turn_index: number
  provider_mode: 'official' | 'custom' | 'unknown'
  provider_id: string
  model_id: string
  source: 'text' | 'voice'
}

export const chatActivationStartedEvent = defineEvent<ChatActivationProperties>('chat_activation_started')

export const chatActivationSucceededEvent = defineEvent<ChatActivationProperties & {
  time_to_first_message_ms?: number
}>('chat_activation_succeeded')

export const chatActivationFailedEvent = defineEvent<ChatActivationProperties & {
  error_code?: string
  failure_stage?: string
}>('chat_activation_failed')
