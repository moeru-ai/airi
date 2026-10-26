import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { providerSettingsRouteOf } from '../libs/providers/metadata'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useVisionStore } from '../stores/modules/vision'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'

/** A provider that a module or a character uses, and that cannot work as it is set up now. */
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
  /** The localized names of the modules that use the provider, in the module settings or in a character. It is never empty. */
  modules: string[]
  /**
   * What is wrong. The list puts `unconfigured` first, because a module cannot use the provider at all.
   * - `unconfigured`: required fields are empty, for example after the API key was cleared.
   * - `failed`: the last check in this session failed. `reason` tells why.
   */
  problem: 'unconfigured' | 'failed'
  /** The first reason that the check reported, as the validator wrote it. It is empty for `unconfigured`, and can be empty for `failed`. */
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

/** The modules that can use a provider, in the order that the modules page lists them. */
const MODULES = ['consciousness', 'speech', 'hearing', 'vision'] as const
type Module = typeof MODULES[number]

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
 * - A settings home shows the providers in use that are not set up, or whose last check failed.
 *
 * Expects:
 * - The provider store checks the added providers at startup, and records the outcome in its runtime state.
 *
 * Returns:
 * - `items`: the providers in use with a problem, that the person did not dismiss. A module or any character can use
 *   a provider. A provider that nothing uses affects nothing, so only the providers page shows its status.
 * - `dismissedIds`: the providers with a problem that stay hidden because the person dismissed them.
 * - `dismiss(id)`: hides a provider on this device until its config or its problem changes.
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
  const cardStore = useAiriCardStore()
  /** The fingerprint of the config and the problem at the time of the dismissal, by provider. */
  const dismissed = useLocalStorage<Record<string, string>>('settings/needs-attention/dismissed', {})

  const problems = computed(() => Object.entries(providersStore.providerRuntimeState).flatMap(([id, runtime]) => {
    // The stored status can come from the last session. The outcome and the reason come only from this session,
    // so the list does not show a provider before the startup check, or hide it while a later check runs.
    // The status must still agree, because some pages set it without a check, for example after a save.
    const status = providerConfigStore.providers[id]?.status
    const config = JSON.stringify(providerConfigStore.configs[id] ?? {})
    if (runtime.validationOutcome === 'unconfigured' && (status === 'unconfigured' || status === 'validating'))
      return [{ id, problem: 'unconfigured' as const, reason: '', fingerprint: fingerprintOf(`${config}\nunconfigured`) }]
    if (runtime.validationReason !== undefined && (status === 'invalid' || status === 'validating'))
      return [{ id, problem: 'failed' as const, reason: runtime.validationReason, fingerprint: fingerprintOf(`${config}\n${runtime.validationReason}`) }]
    return []
  }))

  /**
   * The modules that use each provider. A chat session resolves the modules of its own character,
   * so every character counts, not only the active one.
   */
  const modulesByProvider = computed(() => {
    const selections: Array<readonly [provider: string, module: Module]> = [
      [consciousnessStore.activeProvider, 'consciousness'],
      [speechStore.activeSpeechProvider, 'speech'],
      [hearingStore.activeTranscriptionProvider, 'hearing'],
      [visionStore.activeProvider, 'vision'],
      ...cardStore.characterModules.flatMap(modules => [
        [modules.consciousness.provider, 'consciousness'],
        [modules.speech.provider, 'speech'],
        [modules.vision.provider, 'vision'],
      ] as const),
    ]
    const result = new Map<string, Set<Module>>()
    for (const [provider, module] of selections) {
      if (provider)
        result.set(provider, (result.get(provider) ?? new Set<Module>()).add(module))
    }
    return result
  })

  const items = computed<SettingsNeedsAttentionItem[]>(() => {
    return problems.value
      .filter(problem => dismissed.value[problem.id] !== problem.fingerprint)
      .flatMap((problem) => {
        const metadata = providersStore.availableProvidersMetadata.find(entry => entry.id === problem.id)
        const users = modulesByProvider.value.get(problem.id)
        if (!metadata || !users)
          return []
        return [{
          id: problem.id,
          name: metadata.localizedName,
          icon: metadata.icon,
          iconImage: metadata.iconImage,
          fallbackIcon: providerKindIconOf(metadata.category),
          modules: MODULES.filter(module => users.has(module)).map(module => t(`settings.pages.modules.${module}.title`)),
          problem: problem.problem,
          // `validateProviderConfig` joins its reasons with '; '. The later ones are hints, such as a default base URL
          // or troubleshooting text, and the settings page of the provider shows them in full.
          reason: problem.reason.split('; ')[0] ?? '',
          to: providerSettingsRouteOf(metadata),
        }]
      })
      .sort((left, right) => Number(right.problem === 'unconfigured') - Number(left.problem === 'unconfigured') || left.name.localeCompare(right.name))
  })

  function dismiss(id: string) {
    const problem = problems.value.find(entry => entry.id === id)
    if (problem)
      dismissed.value = { ...dismissed.value, [id]: problem.fingerprint }
  }

  const dismissedIds = computed(() => new Set(problems.value
    .filter(problem => dismissed.value[problem.id] === problem.fingerprint)
    .map(problem => problem.id)))

  function restoreDismissed(id?: string) {
    dismissed.value = id === undefined
      ? {}
      : Object.fromEntries(Object.entries(dismissed.value).filter(([entry]) => entry !== id))
  }

  return { items, dismissedIds, dismiss, restoreDismissed }
}
