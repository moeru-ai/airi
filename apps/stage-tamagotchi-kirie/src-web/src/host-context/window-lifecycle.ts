import type { HostWindowState } from '@gd-kirie/platform'

import type { AiriWindowLifecycleReason, AiriWindowLifecycleState } from '../shared/eventa'

import { hostWindowStateChanged } from '@gd-kirie/platform'

import { initializeHostContext } from './owner'

export interface HostWindowLifecycle {
  getState: () => Promise<AiriWindowLifecycleState>
  onChanged: (listener: (state: AiriWindowLifecycleState) => void) => () => void
}

function changeReason(previous: HostWindowState | undefined, next: HostWindowState): AiriWindowLifecycleReason {
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

function toAiriWindowState(state: HostWindowState, reason: AiriWindowLifecycleReason): AiriWindowLifecycleState {
  return {
    ...state,
    reason,
    updatedAt: Date.now(),
  }
}

export function useHostWindowLifecycle(): HostWindowLifecycle {
  const host = initializeHostContext()
  let previous: HostWindowState | undefined

  return {
    async getState() {
      previous = await host.platform.hostWindow.getState()
      return toAiriWindowState(previous, 'snapshot')
    },
    onChanged(listener) {
      return host.context.on(hostWindowStateChanged, ({ body: next }) => {
        if (!next)
          return

        const reason = changeReason(previous, next)
        previous = next
        listener(toAiriWindowState(next, reason))
      })
    },
  }
}
