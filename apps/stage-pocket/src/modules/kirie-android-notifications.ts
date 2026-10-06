import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { getKirieAndroidEventaContext } from './kirie-android-eventa'

interface NotificationSchedulePayload {
  at: number
  body: string
  id: number
  title: string
}

const scheduleNotificationEvent = defineInvokeEventa<void, NotificationSchedulePayload>(
  'eventa:invoke:airi:android:notification:schedule',
)

export async function scheduleKirieAndroidNotification(payload: NotificationSchedulePayload) {
  await defineInvoke(getKirieAndroidEventaContext(), scheduleNotificationEvent)(payload)
}
