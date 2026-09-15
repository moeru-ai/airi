import { defineInvoke } from '@moeru/eventa'

import { electronAppOpenUserDataFolder } from '../../shared/eventa'
import { initializeHostContext } from './owner'

export interface HostDesktopServices {
  openApplicationDataDirectory: () => Promise<string>
  openExternalUrl: (url: string) => Promise<void>
}

function createElectronDesktopServices(): HostDesktopServices {
  const { context } = initializeHostContext()
  const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

  return {
    async openApplicationDataDirectory() {
      const result = await openUserDataFolder()
      return result.path
    },
    async openExternalUrl(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}

function createKirieDesktopServices(): HostDesktopServices {
  const platform = initializeHostContext().platform!

  return {
    openApplicationDataDirectory() {
      return platform.openApplicationDataDirectory()
    },
    openExternalUrl(url) {
      return platform.openExternalUrl(url)
    },
  }
}

export function useHostDesktopServices(): HostDesktopServices {
  const host = initializeHostContext()
  return host.runtime === 'kirie'
    ? createKirieDesktopServices()
    : createElectronDesktopServices()
}
