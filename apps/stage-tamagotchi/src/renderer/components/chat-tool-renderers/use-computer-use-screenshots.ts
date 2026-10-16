import type { MaybeRefOrGetter } from 'vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { reactive, toValue, watch } from 'vue'

import { computerUseReadImage } from '../../../shared/eventa/computer-use'

/**
 * Reads screenshot files from AIRI computer use storage for a tool call widget.
 *
 * `paths` is `undefined` when the widget has no screenshot to read.
 * Returns a map from each path to its image as a data URL. A file that cannot be read has no entry, so its widget shows no image.
 */
export function useComputerUseScreenshots(paths: MaybeRefOrGetter<string[] | undefined>) {
  const readImage = useElectronEventaInvoke(computerUseReadImage)
  const images = reactive(new Map<string, string>())

  watch(() => toValue(paths), async (next) => {
    for (const path of next ?? []) {
      try {
        images.set(path, await readImage({ path }))
      }
      catch {
        images.delete(path)
      }
    }
  }, { immediate: true })

  return images
}
