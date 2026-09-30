import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { desktopAuthConfiguration } from '../../shared/auth-config'
import { airiAuthConfigure, electronAuthLogout, electronAuthStartLogin } from '../../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieStartLogin = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronAuthStartLogin.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieLogout = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronAuthLogout.sendEvent.id.slice(0, -sendSuffix.length),
)

export interface HostAuth {
  logout: () => Promise<void>
  startLogin: () => Promise<void>
}

/** Configures the Kirie authentication host before login. Electron invokes remain parameterless. */
export function useHostAuth(): HostAuth {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    return {
      logout: defineInvoke(host.context, electronAuthLogout),
      startLogin: defineInvoke(host.context, electronAuthStartLogin),
    }
  }

  const logout = defineInvoke(host.context, kirieLogout)
  const startLogin = defineInvoke(host.context, kirieStartLogin)
  const configure = defineInvoke(host.context, airiAuthConfigure)
  return {
    async logout() {
      await logout({})
    },
    async startLogin() {
      await configure(desktopAuthConfiguration)
      await startLogin({})
    },
  }
}
