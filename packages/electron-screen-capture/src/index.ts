import type { DesktopCapturerSource, SourcesOptions } from 'electron'

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
export const screenCaptureSetSourceEx = defineInvokeEventa<any, ScreenCaptureSetSourceRequest>('eventa:invoke:electron:screen-capture:set-source')
export const screenCaptureResetSource = defineInvokeEventa<any, string>('eventa:invoke:electron:screen-capture:reset-source')
