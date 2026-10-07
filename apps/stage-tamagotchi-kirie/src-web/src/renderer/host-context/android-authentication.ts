import { airiAndroidAuthenticationEventIds } from '../../shared/eventa'
import { invokeAndroidEventa, onAndroidEventa } from './android-permissions'

interface AndroidUrlOpenPayload {
  url?: string
}

export async function openAndroidAuthorization(url: string) {
  await invokeAndroidEventa<void>(airiAndroidAuthenticationEventIds.open, { url })
}

export async function consumePendingAndroidUrlOpen() {
  return await invokeAndroidEventa<AndroidUrlOpenPayload>(
    airiAndroidAuthenticationEventIds.consumeUrlOpen,
    {},
  )
}

export function onAndroidUrlOpen(listener: (url: string) => void) {
  return onAndroidEventa(airiAndroidAuthenticationEventIds.urlOpen, (body) => {
    const { url } = body as AndroidUrlOpenPayload
    if (url)
      listener(url)
  })
}
