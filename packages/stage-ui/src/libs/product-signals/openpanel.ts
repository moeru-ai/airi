import type { AnalyticsAdapter, AnalyticsAdapterOptions } from './client'

import { OpenPanel } from '@openpanel/web'
import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'

import { createPosthogAdapter } from './posthog'

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

/** Routes product events to OpenPanel and AI events to PostHog. */
export function createOpenpanelAdapter(options: AnalyticsAdapterOptions): AnalyticsAdapter {
  const clientId = import.meta.env.VITE_OPENPANEL_CLIENT_ID
  const apiUrl = import.meta.env.VITE_OPENPANEL_API_URL
  if (!clientId || !apiUrl)
    throw new Error('OpenPanel client id and API URL are required')

  let enabled = options.enabled
  // Rotate the device on logout. Clearing SDK fields alone reuses its
  // server-derived fingerprint and can link two accounts in one browser.
  let deviceId = enabled ? loadDeviceId() : undefined
  const ai = createPosthogAdapter(options)
  const panel = new OpenPanel({
    clientId,
    apiUrl,
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
    capture(name, properties, captureOptions) {
      if (!enabled)
        return false
      if (name.startsWith('$ai_'))
        return ai.capture(name, properties, captureOptions)

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
      ai.identify(userId)
    },
    registerBuildInfo(buildInfo) {
      panel.setGlobalProperties({
        app_branch: buildInfo.branch,
        app_build_time: buildInfo.builtOn,
        app_commit: buildInfo.commit,
        app_version: buildInfo.version && buildInfo.version !== '0.0.0' ? buildInfo.version : 'dev',
      })
      ai.registerBuildInfo(buildInfo)
    },
    resetIdentity() {
      panel.clear()
      deviceId = enabled ? rotateDeviceId() : undefined
      panel.setGlobalProperties({ __deviceId: deviceId })
      ai.resetIdentity()
    },
    setCaptureEnabled(value) {
      enabled = value
      ai.setCaptureEnabled(value)
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
