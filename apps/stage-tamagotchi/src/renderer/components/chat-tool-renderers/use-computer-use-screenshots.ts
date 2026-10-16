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
    const wanted = next ?? []
    // A rerun replaces the paths. The screenshots of earlier paths leave the map, so they do not stay in memory.
    for (const path of images.keys()) {
      if (!wanted.includes(path))
        images.delete(path)
    }
    for (const path of wanted) {
      if (images.has(path))
        continue
      try {
        const image = await readImage({ path })
        // A read that ends after the paths changed belongs to an earlier result.
        if (toValue(paths)?.includes(path))
          images.set(path, image)
      }
      catch {
        images.delete(path)
      }
    }
  }, { immediate: true })

  return images
}
