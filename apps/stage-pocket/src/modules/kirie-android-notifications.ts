import { defineEventa, defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { getKirieAndroidEventaContext } from './kirie-android-eventa'

interface NotificationSchedulePayload {
  at: number
  body: string
  id: number
  title: string
}

/** Matches Capacitor's localNotificationActionPerformed payload for a notification tap. */
export interface KirieAndroidNotificationActionPerformed {
  actionId: string
  notification: {
    body: string
    id: number
    schedule: {
      at: string
    }
    title: string
  }
}

interface NotificationScheduleRequest {
  at: number
  notification: KirieAndroidNotificationActionPerformed['notification']
}

interface PendingNotificationActions {
  actions: KirieAndroidNotificationActionPerformed[]
}

const scheduleNotificationEvent = defineInvokeEventa<void, NotificationScheduleRequest>(
  'eventa:invoke:airi:android:notification:schedule',
)
const registerNotificationActionListenerEvent = defineInvokeEventa<PendingNotificationActions, Record<string, never>>(
  'eventa:invoke:airi:android:notification:action-listener:register',
)
const unregisterNotificationActionListenerEvent = defineInvokeEventa<void, Record<string, never>>(
  'eventa:invoke:airi:android:notification:action-listener:unregister',
)
const notificationActionPerformedEvent = defineEventa<KirieAndroidNotificationActionPerformed>(
  'eventa:event:airi:android:notification:action-performed',
)

const notificationActionListeners = new Set<(action: KirieAndroidNotificationActionPerformed) => void>()
let stopNotificationActionEvent: (() => void) | undefined

export async function scheduleKirieAndroidNotification(payload: NotificationSchedulePayload) {
  await defineInvoke(getKirieAndroidEventaContext(), scheduleNotificationEvent)({
    at: payload.at,
    notification: {
      body: payload.body,
      id: payload.id,
      schedule: {
        at: new Date(payload.at).toISOString(),
      },
      title: payload.title,
    },
  })
}

export function onKirieAndroidNotificationActionPerformed(
  listener: (action: KirieAndroidNotificationActionPerformed) => void,
) {
  const context = getKirieAndroidEventaContext()
  notificationActionListeners.add(listener)
  if (!stopNotificationActionEvent) {
    stopNotificationActionEvent = context.on(notificationActionPerformedEvent, ({ body }) => {
      if (!body)
        return
      for (const currentListener of notificationActionListeners)
        currentListener(body)
    })
    void defineInvoke(context, registerNotificationActionListenerEvent)({}).then(({ actions }) => {
      for (const action of actions) {
        for (const currentListener of notificationActionListeners)
          currentListener(action)
      }
    })
  }

  return () => {
    notificationActionListeners.delete(listener)
    if (notificationActionListeners.size > 0)
      return

    stopNotificationActionEvent?.()
    stopNotificationActionEvent = undefined
    void defineInvoke(context, unregisterNotificationActionListenerEvent)({})
  }
}
