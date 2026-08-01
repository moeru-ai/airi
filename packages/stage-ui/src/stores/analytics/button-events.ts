import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'

import { useSettingsAnalytics } from '../settings/analytics'
import { captureAnalyticsEvent, ensureAnalyticsInitialized, isAnalyticsAvailableInBuild } from './client'

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

/**
 * Explicit product events that may be emitted directly from a button click.
 *
 * Add an event here only when clicking the button is itself the fact being
 * measured. Async outcomes and confirmed state changes should remain in their
 * owning business flow.
 */
export type TrackButtonEvent
  = | {
    name: 'controls_island_action'
    action: ControlsIslandAction
  }
  | {
    name: 'update_check_clicked'
    channel: string
  }
  | {
    name: 'update_install_clicked'
    channel: string
    version?: string
  }
  | {
    name: 'mcp_server_added'
  }
  | {
    name: 'mcp_server_removed'
  }

function canCapture(): boolean {
  const settingsAnalytics = useSettingsAnalytics()
  return isAnalyticsAvailableInBuild()
    && settingsAnalytics.analyticsEnabled
    && ensureAnalyticsInitialized(true)
}

function appSurface(): 'web' | 'mobile' | 'electron' {
  if (isStageTamagotchi())
    return 'electron'

  if (isStageCapacitor())
    return 'mobile'

  return 'web'
}

/**
 * Emits a typed button event through the existing analytics opt-in boundary.
 *
 * This is shared with the global directive and imperative analytics facade so
 * both retain one event schema and transport policy.
 */
export function captureTrackButtonEvent(event: TrackButtonEvent) {
  if (!canCapture())
    return

  switch (event.name) {
    case 'controls_island_action': {
      const properties = {
        action: event.action,
        app_surface: appSurface(),
      }
      if (event.action === 'refresh_window' || event.action === 'close_app') {
        captureAnalyticsEvent(event.name, properties, { beforeNavigation: true })
        return
      }

      captureAnalyticsEvent(event.name, properties)
      return
    }
    case 'update_check_clicked':
      captureAnalyticsEvent(event.name, { channel: event.channel })
      return
    case 'update_install_clicked':
      captureAnalyticsEvent(
        event.name,
        { channel: event.channel, ...(event.version && { version: event.version }) },
        { beforeNavigation: true },
      )
      return
    case 'mcp_server_added':
      captureAnalyticsEvent(event.name, {})
      return
    case 'mcp_server_removed':
      captureAnalyticsEvent(event.name, {})
  }
}
