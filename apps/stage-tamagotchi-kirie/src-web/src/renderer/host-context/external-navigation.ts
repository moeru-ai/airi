import { initializeHostContext } from './owner'

function externalHttpUrl(rawUrl: string | URL): string | undefined {
  const url = new URL(rawUrl, window.location.href)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return

  return url.toString()
}

function reportOpenFailure(error: unknown) {
  console.error('[host-context] Failed to open the external URL.', error)
}

export function installExternalNavigation(): () => void {
  const host = initializeHostContext()
  if (host.runtime !== 'kirie')
    return () => {}

  const platform = host.platform!
  const originalOpen = window.open

  function openExternalUrl(rawUrl: string | URL): boolean {
    const url = externalHttpUrl(rawUrl)
    if (!url)
      return false

    platform.openExternalUrl(url).catch(reportOpenFailure)
    return true
  }

  function handleLinkClick(event: MouseEvent) {
    if (event.defaultPrevented)
      return

    const anchor = event.composedPath().find(item => item instanceof HTMLAnchorElement)
    if (!anchor)
      return

    const url = externalHttpUrl(anchor.href)
    if (!url)
      return

    const opensNewWindow = anchor.target.toLowerCase() === '_blank'
    const leavesRendererOrigin = new URL(url).origin !== window.location.origin
    if (!opensNewWindow && !leavesRendererOrigin)
      return

    event.preventDefault()
    platform.openExternalUrl(url).catch(reportOpenFailure)
  }

  window.open = (url, target, features) => {
    if (url) {
      const externalUrl = externalHttpUrl(url)
      const opensNewWindow = target?.toLowerCase() === '_blank'
      const leavesRendererOrigin = externalUrl && new URL(externalUrl).origin !== window.location.origin
      if ((opensNewWindow || leavesRendererOrigin) && openExternalUrl(url))
        return null
    }

    return originalOpen.call(window, url, target, features)
  }
  document.addEventListener('click', handleLinkClick, { capture: true })

  return () => {
    document.removeEventListener('click', handleLinkClick, { capture: true })
    window.open = originalOpen
  }
}
