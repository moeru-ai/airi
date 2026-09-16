import type { StageEnvironment } from '@proj-airi/stage-shared'

import { defineEvent } from '../../../utils/dsl'

/** Stable, low-cardinality actions emitted by the Electron controls island. */
export type ControlsIslandAction
  = | 'expand_controls'
    | 'collapse_controls'
    | 'toggle_settings'
    | 'toggle_profile_picker'
    | 'toggle_chat'
    | 'refresh_window'
    | 'center_main_window'
    | 'switch_to_light_mode'
    | 'switch_to_dark_mode'
    | 'pin_on_top'
    | 'unpin_from_top'
    | 'enable_fade_on_hover'
    | 'disable_fade_on_hover'
    | 'close_app'

export const controlsIslandActionEvent = defineEvent<{
  action: ControlsIslandAction
  environment: StageEnvironment
}>('controls_island_action')
