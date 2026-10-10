import type { NotificationWaveIntent } from '@proj-airi/stage-ui-three/companion'

import type { DesktopCompanionSnapshot, DesktopReactionIntent } from '../../shared/desktop-companion'

/** Main publishes its committed snapshot before the intent. A read, cleared, or evicted group cannot create delayed attention. */
export function desktopWaveIntent(intent: DesktopReactionIntent | undefined, snapshot: DesktopCompanionSnapshot): Omit<NotificationWaveIntent, 'modelId'> | undefined {
  if (!intent || intent.priority !== 'high' || intent.motion !== 'wave'
    || !snapshot.notifications.some(record => record.id === intent.notificationId && !record.read)) {
    return undefined
  }
  return {
    eventId: intent.requestId,
    intentId: intent.requestId,
    coalesceKey: intent.notificationId,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
  }
}
