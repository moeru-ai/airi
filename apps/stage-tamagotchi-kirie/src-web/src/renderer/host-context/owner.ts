import type { KirieEventaContext, KirieEventaContextHandle } from '@gd-kirie/ipc-eventa'
import type { PlatformClient } from '@gd-kirie/platform'
import type { InvokeEventa } from '@moeru/eventa'
import type { ShallowRef } from 'vue'

import { createPlatformClient } from '@gd-kirie/platform'
import { defineInvoke } from '@moeru/eventa'
import { shallowRef } from 'vue'

import { createElectronHostEventaContext } from './electron'
import { createKirieHostEventaContext } from './kirie'

import '@gd-kirie/ipc'

export type HostRuntime = 'electron' | 'kirie'

export interface HostContextOwner {
  context: KirieEventaContext
  platform?: PlatformClient
  runtime: HostRuntime
}

let owner: (HostContextOwner & KirieEventaContextHandle) | undefined

function createHostContextOwner(): HostContextOwner & KirieEventaContextHandle {
  if (window.kirie) {
    const eventa = createKirieHostEventaContext()
    return {
      ...eventa,
      platform: createPlatformClient(eventa.context),
      runtime: 'kirie',
    }
  }

  const eventa = createElectronHostEventaContext()
  return {
    ...eventa,
    runtime: 'electron',
  }
}

export function initializeHostContext(): HostContextOwner {
  owner ??= createHostContextOwner()
  return owner
}

export function getHostEventaContext(): KirieEventaContext {
  return initializeHostContext().context
}

export function useHostEventaContext(): ShallowRef<KirieEventaContext> {
  return shallowRef(getHostEventaContext())
}

export function useHostEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: KirieEventaContext) {
  return defineInvoke(context ?? getHostEventaContext(), invoke)
}

export function getHostPlatform(): PlatformClient | undefined {
  return initializeHostContext().platform
}

export function disposeHostContext() {
  if (!owner)
    return

  owner.context.abort(new Error('AIRI host context disposed.'))
  owner.dispose()
  owner = undefined
}
