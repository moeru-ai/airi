import { defineInvoke } from '@moeru/eventa'

import { channels } from '../../../../../channels'
import { protocolListProviders } from '../../../protocol/resources/providers'

export async function listProviders() {
  const func = defineInvoke(channels.data, protocolListProviders)
  return func()
}

export const providers = {
  listProviders,
}
