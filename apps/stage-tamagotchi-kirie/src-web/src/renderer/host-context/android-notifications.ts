import type { AiriAndroidNotificationSchedulePayload } from '../../shared/eventa'

import { airiAndroidNotificationEventIds } from '../../shared/eventa'
import { invokeAndroidEventa } from './android-permissions'

export async function scheduleAndroidNotification(payload: AiriAndroidNotificationSchedulePayload) {
  await invokeAndroidEventa<void>(airiAndroidNotificationEventIds.schedule, payload)
}
