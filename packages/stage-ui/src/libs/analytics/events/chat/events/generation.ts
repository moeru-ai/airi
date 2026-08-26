import { defineEvent } from '../../../utils/dsl'

export const aiGenerationEvent = defineEvent<{
  conversation_id: string
  input_tokens?: number
  model_id: string
  output_tokens?: number
  provider_id: string
  provider_type: 'custom' | 'official' | 'unknown'
  round_id: string
  total_tokens?: number
  usage_source: 'estimated' | 'reported' | 'unavailable'
}>('$ai_generation')
