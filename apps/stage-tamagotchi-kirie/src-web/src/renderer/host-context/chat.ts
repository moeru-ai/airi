import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { electronOpenChat } from '../../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieOpenChat = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronOpenChat.sendEvent.id.slice(0, -sendSuffix.length),
)

export function useHostChat(): () => Promise<void> {
  const host = initializeHostContext()
  const open = defineInvoke(host.context, kirieOpenChat)
  return async () => {
    await open({})
  }
}
