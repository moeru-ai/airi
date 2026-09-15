import { defineInvoke } from '@moeru/eventa'

import { electronAppOpenUserDataFolder } from '../../shared/eventa'
import { initializeHostContext } from './owner'

export async function openApplicationDataDirectory(): Promise<void> {
  const host = initializeHostContext()
  if (host.runtime === 'kirie') {
    await host.platform!.openApplicationDataDirectory()
    return
  }

  const openUserDataFolder = defineInvoke(host.context, electronAppOpenUserDataFolder)
  await openUserDataFolder()
}
