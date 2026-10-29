import type { AiriMicrophonePermissionState } from '../../shared/eventa'

import { watch } from 'vue'

import { useHostMicrophonePermission } from './microphone-permission'

const browserStates: Record<AiriMicrophonePermissionState, PermissionState> = {
  'granted': 'granted',
  'denied': 'denied',
  'not-determined': 'prompt',
}

/** A `PermissionStatus` that reads the microphone decision of the Kirie host. */
class HostMicrophonePermissionStatus extends EventTarget implements PermissionStatus {
  readonly name = 'microphone'
  onchange: ((this: PermissionStatus, event: Event) => unknown) | null = null
  private readonly readState: () => PermissionState

  constructor(readState: () => PermissionState) {
    super()
    this.readState = readState
  }

  get state() {
    return this.readState()
  }

  /** Tells the page that the host decision changed, as a browser status does. */
  notifyChange() {
    const event = new Event('change')
    this.onchange?.(event)
    this.dispatchEvent(event)
  }
}

/**
 * Answers `navigator.permissions.query({ name: 'microphone' })` with the microphone decision of
 * the Kirie host, until the returned cleanup restores the browser answer. Other permissions keep
 * the browser answer.
 *
 * Kirie answers each CEF microphone request itself, and CEF does not store that answer as a site
 * permission, so the browser reports `prompt` after access was granted. Electron answers the same
 * query through its permission check handler.
 */
export function installMicrophonePermissionStatus(): () => void {
  const permissions = navigator.permissions
  const browserQuery = permissions.query
  const host = useHostMicrophonePermission()
  const ready = host.refresh().catch((error) => {
    console.warn('[host-context] Failed to read microphone permission state:', error)
  })
  const readState = () => browserStates[host.status.value]
  // Each query returns its own status, as in a browser, so one reader cannot replace the
  // `onchange` of another. A weak reference lets an unused status go.
  const statuses = new Set<WeakRef<HostMicrophonePermissionStatus>>()

  const stopWatching = watch(host.status, () => {
    for (const reference of statuses) {
      const status = reference.deref()
      if (status)
        status.notifyChange()
      else
        statuses.delete(reference)
    }
  })

  permissions.query = async (descriptor) => {
    if (descriptor.name !== 'microphone')
      return browserQuery.call(permissions, descriptor)

    await ready
    const status = new HostMicrophonePermissionStatus(readState)
    statuses.add(new WeakRef(status))
    return status
  }

  return () => {
    stopWatching()
    statuses.clear()
    permissions.query = browserQuery
  }
}
