import type { StageEnvironment } from '@proj-airi/stage-shared'

import { defineEvent } from '../../../utils/dsl'

/** Stable, low-cardinality actions emitted by the Electron controls island. */
export type ControlsIslandAction
  = | 'center_main_window'
    | 'close_app'
    | 'collapse_controls'
    | 'disable_fade_on_hover'
    | 'enable_fade_on_hover'
    | 'expand_controls'
    | 'pin_on_top'
    | 'refresh_window'
    | 'switch_to_dark_mode'
    | 'switch_to_light_mode'
    | 'toggle_chat'
    | 'toggle_profile_picker'
    | 'toggle_settings'
    | 'unpin_from_top'

export const controlsIslandActionEvent = defineEvent<{
  action: ControlsIslandAction
  environment: StageEnvironment
}>('controls_island_action')
