import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import { desktopAuthConfiguration } from '../shared/auth-config'
import { airiAuthConfigure, airiAuthLogout, airiAuthStartLogin } from '../shared/eventa'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieStartLogin = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  airiAuthStartLogin.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieLogout = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  airiAuthLogout.sendEvent.id.slice(0, -sendSuffix.length),
)

export interface HostAuth {
  logout: () => Promise<void>
  startLogin: () => Promise<void>
}

/** Configures the authentication host before login. */
export function useHostAuth(): HostAuth {
  const host = initializeHostContext()
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
