import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { SourcesOptions } from 'electron'

import type { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from '.'

import { defineInvoke } from '@moeru/eventa'

import { screenCaptureGetSources, screenCaptureResetSource, screenCaptureSetSourceEx } from '.'

export interface SourceOptionsWithRequest {
  sourcesOptions?: SourcesOptions
  request?: Omit<ScreenCaptureSetSourceRequest, 'options' | 'sourceId'>
}

export function setupElectronScreenCapture(context: ReturnType<typeof createContext>['context']) {
  const invokeGetSources = defineInvoke(context, screenCaptureGetSources)
  const setSource = defineInvoke(context, screenCaptureSetSourceEx)
  const resetSource = defineInvoke(context, screenCaptureResetSource)

  async function getSources(sourcesOptions: SourcesOptions) {
    return invokeGetSources(sourcesOptions)
  }

  async function selectWithSource<R>(
    selectFn: (sources: SerializableDesktopCapturerSource[]) => string | Promise<string>,
    useFn: () => R | Promise<R>,
    options?: SourceOptionsWithRequest,
  ): Promise<R> {
    const sources = await getSources(options?.sourcesOptions)
    const sourceId = await selectFn(sources)

    let handle: string | undefined
    try {
      handle = await setSource({
        options: options?.sourcesOptions,
        sourceId,
        timeout: options?.request?.timeout,
      })
      return await useFn()
    }
    finally {
      if (handle) {
        await resetSource(handle)
      }
    }
  }

  return { getSources, setSource, selectWithSource, resetSource }
}
