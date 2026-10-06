import type { InferOutput } from 'valibot'

import type { FeatureFlag } from '../libs/feature-flags'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { useCloudFetch } from '../composables/cloud'
import { featureFlagPreferencesSchema, featureFlagResponseSchema, featureFlags, resolveFeatureFlag } from '../libs/feature-flags'
import { captureFeatureFlagEvent } from '../libs/product-signals/events/feature-flags'
import { useAuthStore } from './auth'

/** Owns device preferences and a non-persisted policy snapshot for the current account. */
export const useFeatureFlagsStore = defineStore('feature-flags', () => {
  const auth = useAuthStore()
  const cloudFetch = useCloudFetch()
  const preferences = useLocalStorageManualReset<Record<string, boolean>>('settings/feature-flags', {}, {
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

  function preferenceKey(feature: FeatureFlag) {
    return JSON.stringify([feature.key, feature.mode === 'cloud-opt-in' ? auth.user?.id : null])
  }

  function decision(feature: FeatureFlag) {
    return resolveFeatureFlag(feature, preferences.value[preferenceKey(feature)], policies.value.find(policy => policy.key === feature.key), Boolean(auth.user?.id && auth.token))
  }

  const features = computed(() => featureFlags.map(feature => ({
    ...feature,
    ...decision(feature),
    preference: preferences.value[preferenceKey(feature)],
  })).filter(feature => feature.selectable))

  function setPreference(key: string, value: boolean | undefined) {
    const feature = featureFlags.find(feature => feature.key === key)
    if (!feature || !decision(feature).selectable)
      return
    const storageKey = preferenceKey(feature)
    if (preferences.value[storageKey] === value)
      return

    const next = { ...preferences.value }
    if (value === undefined)
      delete next[storageKey]
    else
      next[storageKey] = value
    preferences.value = next
    captureFeatureFlagEvent('feature_flag_changed', key, decision(feature), value ?? null)
  }

  /** Call at the feature entry point, not during settings rendering. Unknown features stay disabled. */
  function isEnabled(key: string): boolean {
    const feature = featureFlags.find(feature => feature.key === key)
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
    policies.value = []
    loading.value = true
    error.value = undefined
    try {
      const response = await cloudFetch('/v1/feature-flags', {
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

  watch([() => auth.sessionVersion, () => auth.user?.id, () => auth.token], () => {
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
