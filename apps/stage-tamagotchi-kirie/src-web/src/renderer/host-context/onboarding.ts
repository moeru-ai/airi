import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { electronOnboardingClose, electronOpenOnboarding } from '../../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieOpenOnboarding = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronOpenOnboarding.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieCloseOnboarding = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronOnboardingClose.sendEvent.id.slice(0, -sendSuffix.length),
)

export interface HostOnboarding {
  close: () => Promise<void>
  open: () => Promise<void>
}

export function useHostOnboarding(): HostOnboarding {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    const close = defineInvoke(host.context, electronOnboardingClose)
    const open = defineInvoke(host.context, electronOpenOnboarding)
    return {
      async close() {
        await close()
      },
      async open() {
        await open()
      },
    }
  }

  const close = defineInvoke(host.context, kirieCloseOnboarding)
  const open = defineInvoke(host.context, kirieOpenOnboarding)
  return {
    async close() {
      await close({})
    },
    async open() {
      await open({})
    },
  }
}
