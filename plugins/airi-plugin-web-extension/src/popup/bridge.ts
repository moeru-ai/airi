import type { BackgroundToPopupMessage, ExtensionSettings, ExtensionStatus, PopupToBackgroundMessage } from '../shared/types'

export async function requestStatus(): Promise<ExtensionStatus> {
  return await browser.runtime.sendMessage({ type: 'popup:get-status' } satisfies PopupToBackgroundMessage)
}

export async function updateSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionStatus> {
  return await browser.runtime.sendMessage({ type: 'popup:update-settings', payload: partial } satisfies PopupToBackgroundMessage)
}

export async function toggleEnabled(enabled: boolean): Promise<ExtensionStatus> {
  return await browser.runtime.sendMessage({ type: 'popup:toggle-enabled', payload: enabled } satisfies PopupToBackgroundMessage)
}

export async function requestVisionFrame(): Promise<ExtensionStatus> {
  return await browser.runtime.sendMessage({ type: 'popup:request-vision-frame' } satisfies PopupToBackgroundMessage)
}

export async function clearError(): Promise<ExtensionStatus> {
  return await browser.runtime.sendMessage({ type: 'popup:clear-error' } satisfies PopupToBackgroundMessage)
}

export function onBackgroundStatus(callback: (status: ExtensionStatus) => void) {
  const listener = (message: BackgroundToPopupMessage) => {
    if (message?.type === 'background:status')
      callback(message.payload)
  }

  browser.runtime.onMessage.addListener(listener)

  return () => browser.runtime.onMessage.removeListener(listener)
}
