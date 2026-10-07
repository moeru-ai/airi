import { useRouter } from 'vue-router'

import { electronOpenSettings } from '../../shared/eventa'
import { isAndroidRenderer } from '../window-context'
import { useHostEventaInvoke } from './owner'

export interface HostSettingsOpenOptions {
  route?: string
}

/** Opens settings in the current Android WebView or a desktop settings window. */
export function useHostSettings(): (options?: HostSettingsOpenOptions) => Promise<void> {
  const router = useRouter()
  const openDesktopSettings = useHostEventaInvoke(electronOpenSettings)

  return async (options = {}) => {
    if (isAndroidRenderer()) {
      await router.push(options.route ?? '/settings')
      return
    }

    await openDesktopSettings(options)
  }
}
