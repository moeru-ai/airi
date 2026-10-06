import type { InferOutput } from 'valibot'

import type { ExperimentalFeature } from '../libs/feature-flags'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { authedFetch } from '../libs/auth-fetch'
import { experimentalFeatures, featureFlagPreferencesSchema, featureFlagResponseSchema, resolveFeatureFlag } from '../libs/feature-flags'
import { captureFeatureFlagEvent } from '../libs/product-signals/events/feature-flags'
import { useAuthStore } from './auth'

/** Owns device preferences and a non-persisted policy snapshot for the current account. */
export const useExperimentalFeaturesStore = defineStore('experimental-features', () => {
  const auth = useAuthStore()
  const preferences = useLocalStorageManualReset<Record<string, boolean>>('settings/experimental-features', {}, {
    serializer: {
      read: value => parse(featureFlagPreferencesSchema, JSON.parse(value)),
      write: value => JSON.stringify(value),
    },
  })
  const policies = shallowRef<InferOutput<typeof featureFlagResponseSchema>['flags']>([])
  const loading = shallowRef(false)
  const error = shallowRef<string>()
  const exposures = new Set<string>()
  let requestVersion = 0
  let request: AbortController | undefined

  function decision(feature: ExperimentalFeature) {
    return resolveFeatureFlag(feature, preferences.value[feature.key], policies.value.find(policy => policy.key === feature.key))
  }

  const features = computed(() => experimentalFeatures.map(feature => ({
    ...feature,
    ...decision(feature),
    preference: preferences.value[feature.key],
  })))

  function setPreference(key: string, value: boolean | undefined) {
    const feature = experimentalFeatures.find(feature => feature.key === key)
    if (!feature || decision(feature).locked || preferences.value[key] === value)
      return

    const next = { ...preferences.value }
    if (value === undefined)
      delete next[key]
    else
      next[key] = value
    preferences.value = next
    captureFeatureFlagEvent('feature_flag_changed', key, decision(feature), value ?? null)
  }

  /** Call at the feature entry point, not during settings rendering. Unknown features stay disabled. */
  function isEnabled(key: string): boolean {
    const feature = experimentalFeatures.find(feature => feature.key === key)
    if (!feature)
      return false

    const resolved = decision(feature)
    const exposure = `${key}:${resolved.enabled}:${resolved.source}`
    if (!exposures.has(exposure) && captureFeatureFlagEvent('feature_flag_exposed', key, resolved))
      exposures.add(exposure)
    return resolved.enabled
  }

  async function refresh() {
    const version = ++requestVersion
    request?.abort()
    request = new AbortController()
    loading.value = true
    error.value = undefined
    try {
      const cloudUrl = import.meta.env.VITE_CLOUD_URL || 'https://cloud.airi.build'
      const response = await authedFetch(new URL('/v1/feature-flags', cloudUrl), {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      })
      if (!response.ok)
        throw new Error(`Feature policy request failed (${response.status})`)
      const result = parse(featureFlagResponseSchema, await response.json())
      if (version === requestVersion)
        policies.value = result.flags
    }
    catch (cause) {
      if (version === requestVersion)
        error.value = errorMessageFrom(cause) ?? 'Feature policy request failed'
    }
    finally {
      if (version === requestVersion)
        loading.value = false
    }
  }

  watch([() => auth.sessionVersion, () => auth.user?.id], () => {
    requestVersion++
    request?.abort()
    policies.value = []
    exposures.clear()
    error.value = undefined
  }, { flush: 'sync' })

  watch([() => auth.sessionVersion, () => auth.user?.id, () => auth.token], () => {
    void refresh()
  }, { immediate: true })

  onScopeDispose(() => {
    requestVersion++
    request?.abort()
  })

  return { features, loading, error, setPreference, isEnabled, refresh }
})
