import {
  defineEventa,
  defineInvoke,
  defineInvokeEventa,
} from '@moeru/eventa'

import { getKirieAndroidEventaContext } from './kirie-android-eventa'

interface OpenAuthorizationPayload {
  url: string
}

interface UrlOpenPayload {
  url: string
}

interface PendingUrlOpenPayload {
  url?: string
}

const openAuthorizationEvent = defineInvokeEventa<void, OpenAuthorizationPayload>(
  'eventa:invoke:airi:android:authentication:open',
)
const consumePendingUrlOpenEvent = defineInvokeEventa<PendingUrlOpenPayload, Record<string, never>>(
  'eventa:invoke:airi:android:app:url-open:consume',
)
const urlOpenEvent = defineEventa<UrlOpenPayload>(
  'eventa:event:airi:android:app:url-open',
)

export async function openKirieAndroidAuthorization(url: string) {
  await defineInvoke(getKirieAndroidEventaContext(), openAuthorizationEvent)({ url })
}

export function onKirieAndroidUrlOpen(listener: (url: string) => void) {
  const context = getKirieAndroidEventaContext()
  const stop = context.on(urlOpenEvent, ({ body }) => {
    if (body?.url)
      listener(body.url)
  })
  void defineInvoke(context, consumePendingUrlOpenEvent)({}).then(({ url }) => {
    if (url)
      listener(url)
  })
  return stop
}
