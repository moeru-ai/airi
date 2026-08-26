import type {
  BrowserDomBridgeStatus,
  BrowserSurfaceAvailability,
  ExecutionTarget,
} from '../types'
import type { CdpAvailabilityStatus } from './cdp-manager'

export function buildBrowserSurfaceAvailability(params: {
  executionTarget?: ExecutionTarget
  extension: BrowserDomBridgeStatus
  cdp: CdpAvailabilityStatus
}): BrowserSurfaceAvailability {
  const { executionTarget, extension, cdp } = params
  const executionMode = executionTarget?.mode ?? 'dry-run'
  const suitable = executionMode !== 'remote'

  const availableSurfaces: BrowserSurfaceAvailability['availableSurfaces'] = []
  if (suitable && extension.enabled && extension.connected) {
    availableSurfaces.push('browser_dom')
  }
  if (suitable && (cdp.connected || cdp.connectable)) {
    availableSurfaces.push('browser_cdp')
  }

  let preferredSurface: BrowserSurfaceAvailability['preferredSurface']
  let selectedToolName: BrowserSurfaceAvailability['selectedToolName']
  let reason: string

  if (!suitable) {
    reason = 'Browser DOM/CDP surfaces are not suitable when the execution target is remote desktop.'
  }
  else if (extension.enabled && extension.connected) {
    preferredSurface = 'browser_dom'
    selectedToolName = 'browser_dom_read_page'
    reason = 'Browser extension bridge is already connected, so the extension DOM stack is preferred.'
  }
  else if (cdp.connected) {
    preferredSurface = 'browser_cdp'
    selectedToolName = 'browser_cdp_collect_elements'
    reason = 'CDP is already connected and ready to inspect the current browser page.'
  }
  else if (cdp.connectable) {
    preferredSurface = 'browser_cdp'
    selectedToolName = 'browser_cdp_collect_elements'
    reason = 'Browser extension is unavailable, but the CDP endpoint is reachable and can be used as fallback.'
  }
  else if (extension.lastError) {
    reason = `Browser extension bridge is unavailable: ${extension.lastError}`
  }
  else if (cdp.lastError) {
    reason = `CDP endpoint is unavailable: ${cdp.lastError}`
  }
  else {
    reason = 'No browser surface bridge is currently available.'
  }

  return {
    executionMode,
    suitable,
    availableSurfaces,
    preferredSurface,
    selectedToolName,
    reason,
    extension: {
      enabled: extension.enabled,
      connected: extension.connected,
      lastError: extension.lastError,
    },
    cdp: {
      endpoint: cdp.endpoint,
      connected: cdp.connected,
      connectable: cdp.connectable,
      lastError: cdp.lastError,
    },
  }
}
