import type { Session, WebContents } from 'electron'

import { isLocalAppURL } from '../../libs/electron/url'

type PermissionCheckHandler = Exclude<Parameters<Session['setPermissionCheckHandler']>[0], null>
type PermissionRequestHandler = Exclude<Parameters<Session['setPermissionRequestHandler']>[0], null>
type ElectronPermission = Parameters<PermissionCheckHandler>[1] | Parameters<PermissionRequestHandler>[1]
type ElectronPermissionDetails = Parameters<PermissionCheckHandler>[3] | Parameters<PermissionRequestHandler>[3]
type LocalAppWebContents = Pick<WebContents, 'getURL'>

const LOCAL_APP_PERMISSION_NAMES = new Set<ElectronPermission>([
  'display-capture',
  'clipboard-sanitized-write',
])

/**
 * Filters out Chromium's opaque origin marker before evaluating explicit frame URLs.
 */
function isUsableRequesterURL(rawURL: string | undefined): rawURL is string {
  return !!rawURL && rawURL !== 'null'
}

/**
 * Checks whether Electron described an audio-only media permission operation.
 */
function isAudioMediaPermission(permission: ElectronPermission, details?: ElectronPermissionDetails): boolean {
  if (permission !== 'media' || !details)
    return false

  if ('mediaTypes' in details && details.mediaTypes?.length) {
    return details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video')
  }

  return 'mediaType' in details && details.mediaType === 'audio'
}

/**
 * Checks whether every requester identity supplied by Electron is local to AIRI.
 */
function shouldGrantLocalAppPermission(
  webContents: LocalAppWebContents | null,
  requestingOrigin?: string,
  details?: ElectronPermissionDetails,
): boolean {
  const requesterURLs = [
    requestingOrigin,
    details?.requestingUrl,
    details && 'securityOrigin' in details ? details.securityOrigin : undefined,
    details && 'embeddingOrigin' in details ? details.embeddingOrigin : undefined,
  ].filter(isUsableRequesterURL)

  if (requesterURLs.length)
    return requesterURLs.every(isLocalAppURL)

  return isLocalAppURL(webContents?.getURL())
}

/**
 * Decides whether an Electron media operation is an AIRI-owned audio-only request.
 *
 * Use when:
 * - Chromium asks the default session to check or request microphone access
 * - A caller needs the same local-frame policy outside the session callbacks
 *
 * Expects:
 * - Permission details come from Electron's official request or check handler contracts
 * - Packaged pages use file URLs and development pages use loopback HTTP URLs
 *
 * Returns:
 * - Whether the operation is audio-only and every supplied requester identity is local
 */
export function shouldGrantAudioCapturePermission(
  webContents: LocalAppWebContents | null,
  permission: ElectronPermission,
  requestingOrigin?: string,
  details?: ElectronPermissionDetails,
): boolean {
  return isAudioMediaPermission(permission, details)
    && shouldGrantLocalAppPermission(webContents, requestingOrigin, details)
}

/**
 * Applies AIRI's allowlist to an Electron session permission operation.
 *
 * Use when:
 * - Wiring both Electron permission check and request handlers
 * - Preserving reviewed local display-capture and clipboard behavior
 *
 * Expects:
 * - Unknown or unreviewed permission categories must remain denied
 * - All explicit frame, security, and embedding origins must identify local AIRI pages
 *
 * Returns:
 * - Whether the requested permission is both allowlisted and locally owned
 */
export function shouldGrantElectronPermission(
  webContents: LocalAppWebContents | null,
  permission: ElectronPermission,
  requestingOrigin?: string,
  details?: ElectronPermissionDetails,
): boolean {
  if (permission === 'media')
    return shouldGrantAudioCapturePermission(webContents, permission, requestingOrigin, details)

  return LOCAL_APP_PERMISSION_NAMES.has(permission)
    && shouldGrantLocalAppPermission(webContents, requestingOrigin, details)
}

/**
 * Registers the paired Electron session handlers required for complete permission policy.
 *
 * Use when:
 * - Initializing Electron's default session after app readiness
 *
 * Expects:
 * - The session is the one used by AIRI renderer windows
 * - macOS systemPreferences remains responsible for OS-level consent prompts and status
 *
 * Returns:
 * - Nothing; both handlers are installed on the supplied session
 */
export function setupMediaPermissionHandlers(
  targetSession: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
): void {
  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(shouldGrantElectronPermission(webContents, permission, undefined, details))
  })

  targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return shouldGrantElectronPermission(webContents, permission, requestingOrigin, details)
  })
}
