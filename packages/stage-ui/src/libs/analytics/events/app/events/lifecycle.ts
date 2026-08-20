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
  trigger_method: 'message_send'
  trigger_type: 'user_action'
}>('first_message_sent')

export const characterSwitchedEvent = defineEvent<{
  from_character_id: string
  to_character_id: string
}>('character_switched')
