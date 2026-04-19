declare module '@proj-airi/electron-screen-capture' {
  import type { DesktopCapturerSource, SourcesOptions } from 'electron'

  export interface SerializableDesktopCapturerSource extends Pick<DesktopCapturerSource, 'id' | 'name' | 'display_id'> {
    appIcon?: Uint8Array
    thumbnail?: Uint8Array
  }

  export interface ScreenCaptureSetSourceRequest {
    options: SourcesOptions
    sourceId: string
    timeout?: number
  }
}
