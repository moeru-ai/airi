import type { Session, WebContents } from 'electron'

interface MediaPermissionDetails {
  mediaType?: string
  mediaTypes?: string[]
  requestingUrl?: string
  securityOrigin?: string
}

const MEDIA_PERMISSION_NAMES = new Set([
  'media',
  'microphone',
  'audioCapture',
])

function isLocalAppURL(rawURL: string | undefined) {
  if (!rawURL)
    return false

  try {
    const url = new URL(rawURL)
    if (url.protocol === 'file:')
      return true

    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return false

    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
  }
  catch {
    return false
  }
}

function isAudioMediaPermission(permission: string, details?: MediaPermissionDetails) {
  if (!MEDIA_PERMISSION_NAMES.has(permission))
    return false

  if (permission !== 'media')
    return true

  if (details?.mediaTypes?.length)
    return details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video')

  return details?.mediaType === 'audio'
}

export function shouldGrantAudioCapturePermission(webContents: WebContents | null, permission: string, requestingOrigin?: string, details?: MediaPermissionDetails) {
  if (!isAudioMediaPermission(permission, details))
    return false

  const requesterURLs = [
    requestingOrigin,
    details?.requestingUrl,
    details?.securityOrigin,
  ].filter(url => !!url)

  if (requesterURLs.length)
    return requesterURLs.every(isLocalAppURL)

  return isLocalAppURL(webContents?.getURL())
}

/**
 * Lets AIRI-owned Electron windows use the microphone on platforms where Chromium asks the
 * session for media permission instead of relying on macOS systemPreferences APIs.
 */
export function setupMediaPermissionHandlers(targetSession: Session) {
  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(shouldGrantAudioCapturePermission(webContents, permission, undefined, details))
  })

  targetSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return shouldGrantAudioCapturePermission(webContents, permission, requestingOrigin, details)
  })
}
