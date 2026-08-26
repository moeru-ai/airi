import type { DesktopCapturerSource } from 'electron'

import type { SerializableDesktopCapturerSource } from '..'

import { shell, systemPreferences } from 'electron'
import { isMacOS } from 'std-env'

export function checkMacOSScreenCapturePermission(): ReturnType<typeof systemPreferences.getMediaAccessStatus> {
  if (!isMacOS) {
    throw new Error('checkMacOSScreenCapturePermission is only available on macOS (darwin)')
  }

  return systemPreferences.getMediaAccessStatus('screen')
}

export function requestMacOSScreenCapturePermission(): void {
  if (!isMacOS) {
    throw new Error('requestMacOSScreenCapturePermission is only available on macOS (darwin)')
  }

  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
}

/**
 * Serializes a DesktopCapturerSource to a format that can be sent over IPC.
 *
 * Using Uint8Array for appIcon and thumbnail here instead of transferable objects
 * or SharedArrayBuffer due to Electron limitations.
 *
 * See:
 * - {@link https://github.com/electron/electron/issues/27024}
 * - {@link https://github.com/electron/electron/issues/34905}
 *
 * @param source - The DesktopCapturerSource to serialize
 * @returns A serializable representation of the DesktopCapturerSource
 */
export function toSerializableDesktopCapturerSource(source: DesktopCapturerSource): SerializableDesktopCapturerSource {
  return {
    appIcon: source.appIcon != null && !source.appIcon.isEmpty() ? new Uint8Array(source.appIcon.toPNG().buffer) : undefined,
    display_id: source.display_id,
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail != null ? new Uint8Array(source.thumbnail.toJPEG(90).buffer) : undefined,
  }
}
