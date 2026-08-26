import { defineEvent } from '../../../utils/dsl'

export const appLoadedEvent = defineEvent<{
  platform: 'desktop' | 'mobile' | 'web'
  version: string
}>('app_loaded')

export const analyticsSettingChangedEvent = defineEvent<{
  app_surface: 'desktop' | 'mobile' | 'web'
  new_value: boolean
  previous_value: boolean
  setting_name: 'analytics_enabled'
  source: 'settings'
}>('settings_changed')

export const firstMessageSentEvent = defineEvent<{
  time_to_first_message_ms: null | number
  trigger_method: 'message_send'
  trigger_type: 'user_action'
}>('first_message_sent')

export const characterSwitchedEvent = defineEvent<{
  from_character_id: string
  to_character_id: string
}>('character_switched')
