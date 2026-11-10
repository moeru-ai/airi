import type { AnalyticsAdapter, AnalyticsAdapterOptions } from './client'

import { OpenPanel } from '@openpanel/web'
import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'
import { OPENPANEL_CONFIG } from '@proj-airi/stage-shared/analytics/openpanel'

const deviceStorageKey = 'airi:openpanel-device-id'

function loadDeviceId(): string {
  try {
    const stored = sessionStorage.getItem(deviceStorageKey)
    if (stored)
      return stored
  }
  catch {
    // Storage can be unavailable in embedded browsers. Keep this visit in memory.
  }
  return rotateDeviceId()
}

function rotateDeviceId(): string {
  const id = crypto.randomUUID()
  try {
    sessionStorage.setItem(deviceStorageKey, id)
  }
  catch {
    // The in-memory identity still isolates accounts when storage is unavailable.
  }
  return id
}

/** Sends product events to OpenPanel under the current consent and identity state. */
export function createOpenpanelAdapter(options: AnalyticsAdapterOptions): AnalyticsAdapter {
  let enabled = options.enabled
  // Rotate the device on logout. Clearing SDK fields alone reuses its
  // server-derived fingerprint and can link two accounts in one browser.
  let deviceId = enabled ? loadDeviceId() : undefined
  const panel = new OpenPanel({
    ...OPENPANEL_CONFIG,
    // Consent must drop events. The SDK's disabled option queues them instead.
    filter(payload) {
      if (!enabled)
        return false
      // OAuth codes and other query values must not enter analytics.
      if (payload.type === 'track' && payload.payload.properties) {
        for (const key of ['__path', '__referrer']) {
          const value = payload.payload.properties[key]
          if (typeof value === 'string')
            payload.payload.properties[key] = value.split(/[?#]/, 1)[0]
        }
      }
      return true
    },
    trackScreenViews: true,
    trackOutgoingLinks: false,
    trackAttributes: false,
  })
  panel.setGlobalProperties({
    app_surface: isStageTamagotchi() ? 'electron' : isStageCapacitor() ? 'mobile' : 'web',
    __deviceId: deviceId,
  })

  return {
    capture(name, properties) {
      if (!enabled)
        return false

      // The SDK uses fetch keepalive for normal events, including navigation.
      void panel.track(name, { ...properties, __deviceId: deviceId }).catch(() => console.warn('[analytics] Product event delivery failed'))
      return true
    },
    getIdentitySnapshot() {
      if (!enabled)
        return null
      if (!deviceId)
        return null
      return { distinctId: deviceId }
    },
    identify(userId) {
      if (!enabled)
        return
      panel.identify({ profileId: userId })
    },
    registerBuildInfo(buildInfo) {
      panel.setGlobalProperties({
        app_branch: buildInfo.branch,
        app_build_time: buildInfo.builtOn,
        app_commit: buildInfo.commit,
        app_version: buildInfo.version && buildInfo.version !== '0.0.0' ? buildInfo.version : 'dev',
      })
    },
    resetIdentity() {
      panel.clear()
      deviceId = enabled ? rotateDeviceId() : undefined
      panel.setGlobalProperties({ __deviceId: deviceId })
    },
    setCaptureEnabled(value) {
      enabled = value
      if (!value) {
        panel.clear()
        deviceId = undefined
        try {
          sessionStorage.removeItem(deviceStorageKey)
        }
        catch {
          // Capture remains disabled even when browser storage is unavailable.
        }
      }
      else if (!deviceId) {
        deviceId = rotateDeviceId()
      }
      panel.setGlobalProperties({ __deviceId: deviceId })
      return enabled
    },
  }
}
