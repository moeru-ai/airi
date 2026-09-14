import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { electronAppQuit } from '../../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieAppQuit = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronAppQuit.sendEvent.id.slice(0, -sendSuffix.length),
)

export function useHostAppQuit(): () => Promise<void> {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    const quit = defineInvoke(host.context, electronAppQuit)
    return async () => {
      await quit()
    }
  }

  const quit = defineInvoke(host.context, kirieAppQuit)
  return async () => {
    await quit({})
  }
}
