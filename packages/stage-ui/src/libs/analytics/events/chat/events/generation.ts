import { defineEvent } from '../../../utils/dsl'

export const aiGenerationEvent = defineEvent<{
  conversation_id: string
  round_id: string
  provider_type: 'official' | 'custom' | 'unknown'
  provider_id: string
  model_id: string
  usage_source: 'reported' | 'estimated' | 'unavailable'
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}>('$ai_generation')
