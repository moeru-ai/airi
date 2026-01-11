import type { IpcRenderer } from '@electron-toolkit/preload'
import type { SourcesOptions } from 'electron'
import type { MaybeRefOrGetter } from 'vue'

import type { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from '..'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { toValue } from 'vue'

import { screenCaptureGetSources, screenCaptureResetSource, screenCaptureSetSourceEx } from '..'

export function useElectronScreenCapture(ipcRenderer: IpcRenderer, sourcesOptions: MaybeRefOrGetter<SourcesOptions>) {
  const context = createContext(ipcRenderer).context

  const invokeGetSources = defineInvoke(context, screenCaptureGetSources)
  const setSource = defineInvoke(context, screenCaptureSetSourceEx)
  const resetSource = defineInvoke(context, screenCaptureResetSource)

  async function getSources() {
    return invokeGetSources(toValue(sourcesOptions))
  }

  async function selectWithSource<R>(
    selectFn: (sources: SerializableDesktopCapturerSource[]) => string,
    useFn: () => Promise<R>,
    request?: Omit<ScreenCaptureSetSourceRequest, 'options' | 'sourceId'>,
  ): Promise<R> {
    const sources = await getSources()
    const sourceId = selectFn(sources)

    let handle: string | undefined
    try {
      handle = await setSource({
        options: toValue(sourcesOptions),
        sourceId,
        timeout: request?.timeout,
      })
      return await useFn()
    }
    finally {
      if (handle) {
        await resetSource(handle)
      }
    }
  }

  return { getSources, setSource, resetSource, selectWithSource }
}
