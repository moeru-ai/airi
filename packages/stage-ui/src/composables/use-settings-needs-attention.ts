import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { providerSettingsRouteOf } from '../libs/providers/metadata'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useVisionStore } from '../stores/modules/vision'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'

/** A provider whose last check in this session failed. */
export interface SettingsNeedsAttentionItem {
  /** The provider id. */
  id: string
  /** The localized name of the provider. */
  name: string
  /** An Iconify class of the provider, when it has one. */
  icon?: string
  /** An image URL of the provider, when it has no icon class. */
  iconImage?: string
  /** The icon of the module kind that the provider serves. It stands in when the provider icon cannot show. */
  fallbackIcon: string
  /** The localized names of the modules that use the provider now. */
  modules: string[]
  /** What the check reported, as the validator wrote it. It can be empty. */
  reason: string
  /** The settings page of the provider. */
  to: string
}

/** The module icon for each provider kind, as the modules page shows it. */
const KIND_ICONS: Record<string, string> = {
  chat: 'i-solar:ghost-bold-duotone',
  speech: 'i-solar:user-speak-rounded-bold-duotone',
  transcription: 'i-solar:microphone-3-bold-duotone',
  vision: 'i-solar:eye-closed-bold-duotone',
}
const PROVIDERS_ICON = 'i-solar:box-minimalistic-bold-duotone'

/** The icon of a provider kind, such as `chat` or `speech`. It stands in for a provider without a brand icon. */
export function providerKindIconOf(kind: string) {
  return KIND_ICONS[kind] ?? PROVIDERS_ICON
}

/** A short FNV-1a fingerprint. A dismissal keeps it, so the stored value holds no credentials. */
function fingerprintOf(text: string) {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Lists the providers that need attention on the settings home.
 *
 * Use when:
 * - A settings home shows the providers whose last check failed.
 *
 * Expects:
 * - The provider store checks the added providers at startup, and records the failure reason in its runtime state.
 *
 * Returns:
 * - `items`: the failed providers that the person did not dismiss. Providers that a module uses come first.
 * - `dismissedIds`: the failed providers that stay hidden because the person dismissed them.
 * - `dismiss(id)`: hides a provider on this device until its config or its failure reason changes.
 * - `restoreDismissed(id?)`: shows a dismissed provider again, or all of them without an id. The developer tools use it.
 */
export function useSettingsNeedsAttention() {
  const { t } = useI18n()
  const providersStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const visionStore = useVisionStore()
  /** The fingerprint of the config and the reason at the time of the dismissal, by provider. */
  const dismissed = useLocalStorage<Record<string, string>>('settings/needs-attention/dismissed', {})

  const failures = computed(() => Object.entries(providersStore.providerRuntimeState).flatMap(([id, runtime]) => {
    // The stored status can come from the last session. The reason comes only from a check in this session,
    // so the list does not show a provider before the startup check, or hide it while a later check runs.
    const status = providerConfigStore.providers[id]?.status
    if (runtime.validationReason === undefined || (status !== 'invalid' && status !== 'validating'))
      return []
    const config = JSON.stringify(providerConfigStore.configs[id] ?? {})
    return [{ id, reason: runtime.validationReason, fingerprint: fingerprintOf(`${config}\n${runtime.validationReason}`) }]
  }))

  const items = computed<SettingsNeedsAttentionItem[]>(() => {
    const users = [
      [consciousnessStore.activeProvider, 'consciousness'],
      [speechStore.activeSpeechProvider, 'speech'],
      [hearingStore.activeTranscriptionProvider, 'hearing'],
      [visionStore.activeProvider, 'vision'],
    ] as const
    return failures.value
      .filter(failure => dismissed.value[failure.id] !== failure.fingerprint)
      .flatMap((failure) => {
        const metadata = providersStore.availableProvidersMetadata.find(entry => entry.id === failure.id)
        if (!metadata)
          return []
        const modules = users
          .filter(([provider]) => provider === failure.id)
          .map(([, module]) => t(`settings.pages.modules.${module}.title`))
        return [{
          id: failure.id,
          name: metadata.localizedName,
          icon: metadata.icon,
          iconImage: metadata.iconImage,
          fallbackIcon: providerKindIconOf(metadata.category),
          modules,
          reason: failure.reason,
          to: providerSettingsRouteOf(metadata),
        }]
      })
      .sort((left, right) => Number(right.modules.length > 0) - Number(left.modules.length > 0) || left.name.localeCompare(right.name))
  })

  function dismiss(id: string) {
    const failure = failures.value.find(entry => entry.id === id)
    if (failure)
      dismissed.value = { ...dismissed.value, [id]: failure.fingerprint }
  }

  const dismissedIds = computed(() => new Set(failures.value
    .filter(failure => dismissed.value[failure.id] === failure.fingerprint)
    .map(failure => failure.id)))

  function restoreDismissed(id?: string) {
    dismissed.value = id === undefined
      ? {}
      : Object.fromEntries(Object.entries(dismissed.value).filter(([entry]) => entry !== id))
  }

  return { items, dismissedIds, dismiss, restoreDismissed }
}
