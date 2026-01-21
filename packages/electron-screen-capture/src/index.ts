import type { DesktopCapturerSource, SourcesOptions, systemPreferences } from 'electron'

import { defineInvokeEventa } from '@moeru/eventa'

export interface SerializableDesktopCapturerSource extends Pick<DesktopCapturerSource, 'id' | 'name' | 'display_id'> {
  appIcon?: Uint8Array
  thumbnail?: Uint8Array
}

export interface ScreenCaptureSetSourceRequest {
  options: SourcesOptions
  sourceId: string
  /**
   * Timeout in milliseconds to release the setSourceMutex.
   *
   * @default 5000
   */
  timeout?: number
}

export const screenCaptureGetSources = defineInvokeEventa<SerializableDesktopCapturerSource[], SourcesOptions>('eventa:invoke:electron:screen-capture:get-sources')
export const screenCaptureSetSourceEx = defineInvokeEventa<string, ScreenCaptureSetSourceRequest>('eventa:invoke:electron:screen-capture:set-source')
export const screenCaptureResetSource = defineInvokeEventa<void, string>('eventa:invoke:electron:screen-capture:reset-source')

export const screenCaptureCheckMacOSPermission = defineInvokeEventa<ReturnType<typeof systemPreferences.getMediaAccessStatus>, never>('eventa:invoke:electron:screen-capture:check-macos-permission')
export const screenCaptureRequestMacOSPermission = defineInvokeEventa<void, never>('eventa:invoke:electron:screen-capture:request-macos-permission')

export const screenCapture = {
  getSources: screenCaptureGetSources,
  setSource: screenCaptureSetSourceEx,
  resetSource: screenCaptureResetSource,
  checkMacOSPermission: screenCaptureCheckMacOSPermission,
  requestMacOSPermission: screenCaptureRequestMacOSPermission,
}
