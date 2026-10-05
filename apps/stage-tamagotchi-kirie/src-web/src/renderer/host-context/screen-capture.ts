import type { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
import type { SourcesOptions, systemPreferences } from 'electron'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Reports screen capture as unsupported until Kirie provides the capability.
 */
export function useHostScreenCapture(_sourcesOptions: MaybeRefOrGetter<SourcesOptions>) {
  const unavailable = () => {
    throw new Error('Screen capture is not available in the Kirie host.')
  }

  return {
    isSupported: false,
    getSources: async (): Promise<SerializableDesktopCapturerSource[]> => [],
    setSource: async (_request: ScreenCaptureSetSourceRequest): Promise<string> => unavailable(),
    resetSource: async (_handle: string): Promise<void> => {},
    selectWithSource: async <R>(
      _select: (sources: SerializableDesktopCapturerSource[]) => string,
      _use: () => Promise<R>,
      _request?: Omit<ScreenCaptureSetSourceRequest, 'options' | 'sourceId'>,
    ): Promise<R> => unavailable(),
    checkMacOSPermission: async (): Promise<ReturnType<typeof systemPreferences.getMediaAccessStatus>> => 'denied',
    requestMacOSPermission: async () => {},
  }
}
