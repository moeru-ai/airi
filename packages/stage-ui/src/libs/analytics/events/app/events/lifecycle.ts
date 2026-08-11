import { defineEvent } from '../../../utils/dsl'

export const appLoadedEvent = defineEvent<{
  platform: 'web' | 'desktop' | 'mobile'
  version: string
}>('app_loaded')

export const analyticsSettingChangedEvent = defineEvent<{
  setting_name: 'analytics_enabled'
  previous_value: boolean
  new_value: boolean
  source: 'settings'
  app_surface: 'web' | 'desktop' | 'mobile'
}>('settings_changed')

export const firstMessageSentEvent = defineEvent<{
  time_to_first_message_ms: number | null
}>('first_message_sent')

export const firstModelSelectedEvent = defineEvent<{
  model_id: string
  provider: string
}>('first_model_selected')

export const providerSwitchedEvent = defineEvent<{
  from_provider: string
  to_provider: string
  from_provider_type: 'official' | 'custom' | 'unknown'
  to_provider_type: 'official' | 'custom' | 'unknown'
  reason: 'manual'
  app_surface: 'web' | 'desktop' | 'mobile'
}>('provider_switched')

export const modelSwitchedEvent = defineEvent<{
  from_model: string
  to_model: string
  reason: 'manual'
}>('model_switched')

export const modelChangedEvent = defineEvent<{
  from_model: string
  to_model: string
  provider: string
  reason: 'manual'
  app_surface: 'web' | 'desktop' | 'mobile'
}>('model_changed')

export const characterSwitchedEvent = defineEvent<{
  from_character_id: string
  to_character_id: string
}>('character_switched')
