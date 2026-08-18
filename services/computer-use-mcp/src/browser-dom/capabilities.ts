export interface BrowserDomCapabilitySource {
  getStatus: () => { connected: boolean }
  supportsAction?: (action: string) => boolean
}

export function isBrowserDomActionSupported(
  bridge: BrowserDomCapabilitySource,
  ...actions: string[]
) {
  if (!bridge.getStatus().connected)
    return false

  return actions.every(action => bridge.supportsAction?.(action) ?? true)
}

export function getUnsupportedBrowserDomActions(
  bridge: BrowserDomCapabilitySource,
  ...actions: string[]
) {
  if (!bridge.getStatus().connected)
    return [...actions]

  return actions.filter(action => !(bridge.supportsAction?.(action) ?? true))
}
