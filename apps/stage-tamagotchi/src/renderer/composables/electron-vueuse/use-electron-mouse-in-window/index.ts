import type { MouseInElementOptions } from '@vueuse/core'

import { useElectronMouseInElement } from '../use-electron-mouse-in-element'

export function useElectronMouseInWindow(
  options: MouseInElementOptions = {},
) {
  return useElectronMouseInElement(undefined, options)
}
