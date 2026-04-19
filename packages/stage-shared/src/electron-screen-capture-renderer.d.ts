declare module '@proj-airi/electron-screen-capture/renderer' {
  import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
  import type { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
  import type { SourcesOptions } from 'electron'

  export interface SourceOptionsWithRequest {
    sourcesOptions: SourcesOptions
    request?: Omit<ScreenCaptureSetSourceRequest, 'options' | 'sourceId'>
  }

  export function setupElectronScreenCapture(context: ReturnType<typeof createContext>['context']): {
    getSources: (sourcesOptions: SourcesOptions) => Promise<SerializableDesktopCapturerSource[]>
    setSource: (request: ScreenCaptureSetSourceRequest) => Promise<string>
    selectWithSource: <R>(
      selectFn: (sources: SerializableDesktopCapturerSource[]) => string | Promise<string>,
      useFn: () => R | Promise<R>,
      options: SourceOptionsWithRequest,
    ) => Promise<R>
    resetSource: (handle: string) => Promise<void>
    checkMacOSPermission: () => Promise<unknown>
    requestMacOSPermission: () => Promise<void>
  }
}
