import type { MissingSpeechField } from '../stores/modules/speech'

import { useLocalStorage } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { providerSettingsRouteOf } from '../libs/providers/metadata'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { missingSpeechFields, useSpeechStore } from '../stores/modules/speech'
import { useVisionStore } from '../stores/modules/vision'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'

/** A setting that keeps a feature in use from working. The settings home lists it. */
export interface SettingsNeedsAttentionItem {
  /**
   * A stable id. A dismissal keeps it.
   * It is the provider id for a provider, and `speech:<character id>` for the speech of a character.
   */
  id: string
  /** One sentence that names the problem, for example "OpenAI failed its last check". */
  title: string
  /** One quiet line under the title, for example the reason of a check and the modules that use the provider. */
  detail: string
  /** An Iconify class, when the item has one. */
  icon?: string
  /** An image URL, when the item has no icon class. */
  iconImage?: string
  /** The icon of the module kind. It stands in when the item icon cannot show. */
  fallbackIcon: string
  /** The localized names of the modules that the problem affects. It is never empty. */
  modules: string[]
  /**
   * The feature cannot work until the person changes a setting, for example after the API key was cleared.
   * These items come first. A failed check is not blocking, because the next check can pass.
   */
  blocking: boolean
  /** The settings page that fixes the problem. */
  to: string
}

/** An item and the fingerprint of its cause. A dismissal stores the fingerprint, so a new cause shows the item again. */
interface Problem {
  item: SettingsNeedsAttentionItem
  fingerprint: string
}

/** The speech of one character, as the list sees it. The developer tools show it. */
export interface CharacterSpeechState {
  /** The character id. */
  id: string
  /** The name of the character. */
  name: string
  /** The selected speech provider. It is empty, or `speech-noop`, when speech is off. */
  provider: string
  /** The localized name of the provider, when the provider is known. */
  providerName?: string
  /** Whether the provider is configured. Without it, the provider shows as its own item, not the speech. */
  providerConfigured: boolean
  /** The fields that the speech lacks before it can speak. */
  missing: MissingSpeechField[]
  /** The developer tools make the list treat this speech as one without a voice. */
  simulated: boolean
}

/**
 * The characters whose speech the developer tools make the list treat as one without a voice.
 * The settings home and the developer tools share it in one window. It ends when the app quits.
 */
const simulatedSpeechIds = shallowRef<ReadonlySet<string>>(new Set())

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

/** The title of a character whose speech lacks fields, by the fields that it lacks. */
const SPEECH_TITLE_KEYS: Record<string, string> = {
  'model': 'settings.needs-attention.speech-no-model',
  'voice': 'settings.needs-attention.speech-no-voice',
  'model,voice': 'settings.needs-attention.speech-no-model-voice',
}

/** The item id of the speech of a character. */
export function speechItemIdOf(characterId: string) {
  return `speech:${characterId}`
}

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
 * Lists the settings that keep a feature in use from working, for the settings home.
 *
 * Use when:
 * - A settings home shows what the person must fix.
 *
 * Expects:
 * - The provider store checks the added providers at startup, and records the outcome in its runtime state.
 *
 * Returns:
 * - `items`: the problems that the person did not dismiss. Blocking problems come first. It lists:
 *   - providers in use that are not set up, or whose last check failed. A module or any character can use a provider.
 *     A provider that nothing uses affects nothing, so only the providers page shows its status.
 *   - characters whose speech has a configured provider, but no model or no voice. Their replies stay text only.
 * - `dismissedIds`: the ids of the problems that stay hidden because the person dismissed them.
 * - `dismiss(id)`: hides a problem on this device until its cause changes.
 * - `restoreDismissed(id?)`: shows a dismissed problem again, or all of them without an id. The developer tools use it.
 */
export function useSettingsNeedsAttention() {
  const { t, locale } = useI18n()
  const providersStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const visionStore = useVisionStore()
  const cardStore = useAiriCardStore()
  /** The fingerprint of the cause at the time of the dismissal, by item id. */
  const dismissed = useLocalStorage<Record<string, string>>('settings/needs-attention/dismissed', {})

  function listOf(names: string[]) {
    return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(names)
  }

  function moduleTitleOf(module: Module) {
    return t(`settings.pages.modules.${module}.title`)
  }

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
      ...[...cardStore.characterModules.values()].flatMap(modules => [
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

  /** Providers in use that are not set up, or whose last check in this session failed. */
  const providerProblems = computed(() => Object.entries(providersStore.providerRuntimeState).flatMap(([id, runtime]): Problem[] => {
    const metadata = providersStore.availableProvidersMetadata.find(entry => entry.id === id)
    const users = modulesByProvider.value.get(id)
    if (!metadata || !users)
      return []

    const modules = MODULES.filter(module => users.has(module)).map(moduleTitleOf)
    const usedBy = t('settings.needs-attention.used-by', { modules: listOf(modules) })
    const shown = {
      id,
      icon: metadata.icon,
      iconImage: metadata.iconImage,
      fallbackIcon: providerKindIconOf(metadata.category),
      modules,
      to: providerSettingsRouteOf(metadata),
    }
    // The stored status can come from the last session. The outcome and the reason come only from this session,
    // so the list does not show a provider before the startup check, or hide it while a later check runs.
    // The status must still agree, because some pages set it without a check, for example after a save.
    const status = providerConfigStore.providers[id]?.status
    const config = JSON.stringify(providerConfigStore.configs[id] ?? {})
    if (runtime.validationOutcome === 'unconfigured' && (status === 'unconfigured' || status === 'validating')) {
      return [{
        item: { ...shown, title: t('settings.needs-attention.title-unconfigured', { name: metadata.localizedName }), detail: usedBy, blocking: true },
        fingerprint: fingerprintOf(`${config}\nunconfigured`),
      }]
    }
    if (runtime.validationReason !== undefined && (status === 'invalid' || status === 'validating')) {
      // `validateProviderConfig` joins its reasons with '; '. The later ones are hints, such as a default base URL
      // or troubleshooting text, and the settings page of the provider shows them in full.
      const reason = runtime.validationReason.split('; ')[0] ?? ''
      return [{
        item: { ...shown, title: t('settings.needs-attention.title-one', { name: metadata.localizedName }), detail: [reason, usedBy].filter(Boolean).join(' · '), blocking: false },
        fingerprint: fingerprintOf(`${config}\n${runtime.validationReason}`),
      }]
    }
    return []
  }))

  /** The speech of every character, resolved as a reply resolves it. */
  const characterSpeech = computed(() => [...cardStore.characterModules].map(([id, modules]): CharacterSpeechState => {
    const { provider } = modules.speech
    return {
      id,
      name: cardStore.cards.get(id)?.name || id,
      provider,
      providerName: providersStore.availableProvidersMetadata.find(entry => entry.id === provider)?.localizedName,
      providerConfigured: providerConfigStore.providers[provider]?.status === 'configured',
      missing: missingSpeechFields(
        modules.speech,
        providerConfigStore.getProviderConfig(provider) ?? {},
        () => providersStore.getDefaultModelForProvider(provider),
      ),
      simulated: simulatedSpeechIds.value.has(id),
    }
  }))

  /**
   * Characters whose speech has a configured provider, but no model or no voice.
   * Their replies stay text only, and nothing else tells the person why.
   * A provider that is not set up, or that failed its check, shows as its own item instead.
   */
  const speechProblems = computed(() => characterSpeech.value.flatMap((speech): Problem[] => {
    const missing: MissingSpeechField[] = speech.simulated ? ['voice'] : speech.providerConfigured ? speech.missing : []
    const titleKey = SPEECH_TITLE_KEYS[missing.join(',')]
    if (!titleKey)
      return []

    const selection = cardStore.characterModules.get(speech.id)?.speech
    const cause = speech.simulated ? t('settings.needs-attention.simulated') : speech.providerName
    return [{
      item: {
        id: speechItemIdOf(speech.id),
        title: t(titleKey, { name: speech.name }),
        detail: [t('settings.needs-attention.text-only'), cause].filter(Boolean).join(' · '),
        fallbackIcon: providerKindIconOf('speech'),
        modules: [moduleTitleOf('speech')],
        blocking: true,
        // The speech page edits the speech of the active character. Another character changes it in its own editor.
        to: speech.id === cardStore.activeCardId
          ? '/settings/modules/speech'
          : `/settings/airi-card/${encodeURIComponent(speech.id)}/edit?section=modules`,
      },
      fingerprint: fingerprintOf(`${JSON.stringify(selection)}\n${missing.join(',')}${speech.simulated ? '\nsimulated' : ''}`),
    }]
  }))

  /** Makes the list treat the speech of a character as one without a voice, or stops it. The developer tools use it. */
  function setSimulatedSpeechGap(id: string, simulated: boolean) {
    const next = new Set(simulatedSpeechIds.value)
    if (simulated)
      next.add(id)
    else
      next.delete(id)
    simulatedSpeechIds.value = next
  }

  const problems = computed(() => [...providerProblems.value, ...speechProblems.value])

  const items = computed<SettingsNeedsAttentionItem[]>(() => problems.value
    .filter(problem => dismissed.value[problem.item.id] !== problem.fingerprint)
    .map(problem => problem.item)
    .sort((left, right) => Number(right.blocking) - Number(left.blocking) || left.title.localeCompare(right.title)))

  function dismiss(id: string) {
    const problem = problems.value.find(entry => entry.item.id === id)
    if (problem)
      dismissed.value = { ...dismissed.value, [id]: problem.fingerprint }
  }

  const dismissedIds = computed(() => new Set(problems.value
    .filter(problem => dismissed.value[problem.item.id] === problem.fingerprint)
    .map(problem => problem.item.id)))

  function restoreDismissed(id?: string) {
    dismissed.value = id === undefined
      ? {}
      : Object.fromEntries(Object.entries(dismissed.value).filter(([entry]) => entry !== id))
  }

  return { items, dismissedIds, dismiss, restoreDismissed, characterSpeech, setSimulatedSpeechGap }
}
