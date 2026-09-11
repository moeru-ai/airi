import type { DevicePermissionHandlerHandlerDetails, HIDDevice, Session, WebContents } from 'electron'

import { isLocalAppURL } from '../../libs/electron/url'

type PermissionCheckHandler = Exclude<Parameters<Session['setPermissionCheckHandler']>[0], null>
type PermissionRequestHandler = Exclude<Parameters<Session['setPermissionRequestHandler']>[0], null>
type ElectronPermission = Parameters<PermissionCheckHandler>[1] | Parameters<PermissionRequestHandler>[1]
type ElectronPermissionDetails = Parameters<PermissionCheckHandler>[3] | Parameters<PermissionRequestHandler>[3]
type LocalAppWebContents = Pick<WebContents, 'getURL'>

const LOCAL_APP_PERMISSION_NAMES = new Set<ElectronPermission>([
  'display-capture',
  'clipboard-sanitized-write',
  'hid',
])

const GENERIC_DESKTOP_USAGE_PAGE = 0x01
const GAME_CONTROLLER_USAGES = new Set([
  0x04, // Joystick
  0x05, // Game Pad
  0x08, // Multi-axis Controller
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
 * Checks whether Electron described a desktop capture operation of any kind.
 *
 * Electron routes desktop capture through the `media` permission and only appends `audio` or `video` to
 * `mediaTypes` for device capture, so desktop capture is the media operation that declares no media type
 * at all. Both `getDisplayMedia()` and the legacy `chromeMediaSource: 'desktop'` constraint look like
 * this, so the permission details alone cannot tell them apart.
 * See {@link https://github.com/electron/electron/blob/v41.2.1/shell/browser/web_contents_permission_helper.cc#L249-L274}.
 */
function isDesktopCaptureMediaPermission(permission: ElectronPermission, details?: ElectronPermissionDetails): boolean {
  if (permission !== 'media' || !details)
    return false

  return 'mediaTypes' in details && details.mediaTypes?.length === 0
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

function isGameController(device: HIDDevice): boolean {
  return device.collections.some(collection =>
    collection.usagePage === GENERIC_DESKTOP_USAGE_PAGE
    && GAME_CONTROLLER_USAGES.has(collection.usage),
  )
}

/**
 * Grants device access only to game controllers requested by an AIRI-owned page.
 *
 * Triggering workflow:
 *
 * {@link Navigator.hid}
 *   -> {@link Session.setDevicePermissionHandler}
 *     -> `hid`
 *       -> {@link shouldGrantDevicePermission}
 *
 * Upstream:
 * - {@link setupPermissionHandlers}
 *
 * Downstream:
 * - {@link isLocalAppURL}
 */
function shouldGrantDevicePermission(details: DevicePermissionHandlerHandlerDetails): boolean {
  if (details.deviceType !== 'hid' || !('collections' in details.device) || !isLocalAppURL(details.origin))
    return false

  return isGameController(details.device)
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
 * - Electron reports desktop capture through the `media` permission instead of `display-capture`
 * - Desktop capture is only ever requested by AIRI's own selected-source flow
 *
 * Returns:
 * - Whether the requested permission is allowlisted, locally owned, and authorized for desktop capture
 */
export function shouldGrantElectronPermission(
  webContents: LocalAppWebContents | null,
  permission: ElectronPermission,
  requestingOrigin?: string,
  details?: ElectronPermissionDetails,
  isDesktopCaptureAuthorized: () => boolean = () => false,
): boolean {
  if (shouldGrantAudioCapturePermission(webContents, permission, requestingOrigin, details))
    return true

  // Desktop capture arrives as a `media` operation, so it has to be resolved back to the reviewed
  // `display-capture` entry before the allowlist is consulted. Camera and microphone operations keep
  // reporting their device media type and therefore never reach the allowlist through this path.
  const isDesktopCapture = isDesktopCaptureMediaPermission(permission, details)

  // Electron cannot distinguish `getDisplayMedia()` from the legacy `chromeMediaSource: 'desktop'`
  // constraint here, and only the former is routed through `setDisplayMediaRequestHandler`. Requiring an
  // authorized source keeps the legacy path from capturing the full desktop behind AIRI's picker, and
  // costs the supported path nothing: without that handler Electron answers `NOT_SUPPORTED` regardless.
  if (isDesktopCapture && !isDesktopCaptureAuthorized())
    return false

  const allowlistPermission = isDesktopCapture ? 'display-capture' : permission

  return LOCAL_APP_PERMISSION_NAMES.has(allowlistPermission)
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
 * - `isDesktopCaptureAuthorized` reports whether a renderer already selected a capture source
 *
 * Returns:
 * - Nothing; permission request, permission check, and device permission handlers are installed
 */
export function setupPermissionHandlers(
  targetSession: Pick<Session, 'setDevicePermissionHandler' | 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  isDesktopCaptureAuthorized: () => boolean,
): void {
  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(shouldGrantElectronPermission(webContents, permission, undefined, details, isDesktopCaptureAuthorized))
  })

  targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return shouldGrantElectronPermission(webContents, permission, requestingOrigin, details, isDesktopCaptureAuthorized)
  })

  targetSession.setDevicePermissionHandler(shouldGrantDevicePermission)
}
