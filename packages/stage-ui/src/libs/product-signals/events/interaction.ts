import type { ControlsIslandAction } from './controls-island'

import { getStage } from '@proj-airi/stage-shared'

import { useSettingsAnalytics } from '../../../stores/settings/analytics'
import { enableAnalytics, getAnalytics, isAnalyticsAvailableInBuild } from '../index'
import { controlsIslandActionEvent } from './controls-island'
import { mcpServerUpdatedEvent } from './mcp'
import { updateCheckClickedEvent, updateInstallClickedEvent } from './update'

/** User interaction events emitted by the shared tracking directive. */
export type TrackButtonEvent
  = | { name: 'controls_island_action', action: ControlsIslandAction }
    | { name: 'update_check_clicked', channel: string }
    | { name: 'update_install_clicked', channel: string, version?: string }
    | { name: 'mcp_server_updated', action: 'add' | 'remove' }

function canCapture(): boolean {
  return isAnalyticsAvailableInBuild()
    && useSettingsAnalytics().analyticsEnabled
    && enableAnalytics()
}

/** Sends a typed interaction event through the shared consent boundary. */
export function captureTrackButtonEvent(event: TrackButtonEvent): void {
  if (!canCapture())
    return

  const analytics = getAnalytics()

  switch (event.name) {
    case 'controls_island_action':
      analytics.emit(
        controlsIslandActionEvent,
        { action: event.action, environment: getStage() },
        event.action === 'refresh_window' || event.action === 'close_app'
          ? { beforeNavigation: true }
          : undefined,
      )
      return
    case 'update_check_clicked':
      analytics.emit(updateCheckClickedEvent, { channel: event.channel })
      return
    case 'update_install_clicked':
      analytics.emit(updateInstallClickedEvent, {
        channel: event.channel,
        ...(event.version && { version: event.version }),
      }, { beforeNavigation: true })
      return
    case 'mcp_server_updated':
      analytics.emit(mcpServerUpdatedEvent, { action: event.action })
  }
}
