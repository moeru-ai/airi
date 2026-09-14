import type { HostWindowState } from '@gd-kirie/platform'

import type { ElectronWindowLifecycleReason, ElectronWindowLifecycleState } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'

import { electronGetWindowLifecycleState, electronWindowLifecycleChanged } from '../../shared/eventa'
import { initializeHostContext } from './owner'

export interface HostWindowLifecycle {
  getState: () => Promise<ElectronWindowLifecycleState>
  onChanged: (listener: (state: ElectronWindowLifecycleState) => void) => () => void
}

function changeReason(previous: HostWindowState | undefined, next: HostWindowState): ElectronWindowLifecycleReason {
  if (previous?.minimized !== next.minimized)
    return next.minimized ? 'minimize' : 'restore'

  if (previous?.visible !== next.visible)
    return next.visible ? 'show' : 'hide'

  if (previous?.focused !== next.focused)
    return next.focused ? 'focus' : 'blur'

  if (next.minimized)
    return 'minimize'
  if (!next.visible)
    return 'hide'
  if (!next.focused)
    return 'blur'
  return 'snapshot'
}

function toAiriWindowState(state: HostWindowState, reason: ElectronWindowLifecycleReason): ElectronWindowLifecycleState {
  return {
    ...state,
    reason,
    updatedAt: Date.now(),
  }
}

function createElectronWindowLifecycle(): HostWindowLifecycle {
  const { context } = initializeHostContext()
  const getState = defineInvoke(context, electronGetWindowLifecycleState)

  return {
    getState,
    onChanged(listener) {
      return context.on(electronWindowLifecycleChanged, ({ body }) => {
        if (body)
          listener(body)
      })
    },
  }
}

function createKirieWindowLifecycle(): HostWindowLifecycle {
  const host = initializeHostContext()
  let previous: HostWindowState | undefined

  return {
    async getState() {
      previous = await host.platform!.hostWindow.getState()
      return toAiriWindowState(previous, 'snapshot')
    },
    onChanged(listener) {
      return host.platform!.hostWindow.onStateChanged((next) => {
        const reason = changeReason(previous, next)
        previous = next
        listener(toAiriWindowState(next, reason))
      })
    },
  }
}

export function useHostWindowLifecycle(): HostWindowLifecycle {
  const host = initializeHostContext()
  return host.runtime === 'kirie'
    ? createKirieWindowLifecycle()
    : createElectronWindowLifecycle()
}
