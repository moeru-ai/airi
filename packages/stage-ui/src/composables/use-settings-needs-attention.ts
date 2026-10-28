import type { SettingsSearchRouteMeta } from '@proj-airi/stage-shared/settings-search'

import type { HearingInputMode } from '../stores/modules/hearing'
import type { MissingSpeechField } from '../stores/modules/speech'

import { SETTINGS_SEARCH_QUERY } from '@proj-airi/stage-shared/settings-search'
import { useLocalStorage } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { providerSettingsRouteOf } from '../libs/providers/metadata'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { startsInputOnSpeech, useHearingStore } from '../stores/modules/hearing'
import { speechFieldsKeyOf, speechFieldStatus, useSpeechStore } from '../stores/modules/speech'
import { useVisionStore } from '../stores/modules/vision'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'

/** A setting that keeps a feature in use from working. The settings home lists it. */
export interface SettingsNeedsAttentionItem {
  /**
   * A stable id. A dismissal keeps it. It is one of:
   * - the provider id, for a provider that is not set up or that failed its check.
   * - `provider-unavailable:<character id>:<module>`, or `provider-unavailable:hearing`, for a provider that a module cannot select.
   * - `speech:<character id>`, for the speech of a character without a model or a voice.
   * - `hearing`, for voice input that Hearing cannot transcribe.
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

/** An item, and whether the person dismissed it. The developer tools list both kinds. */
export interface SettingsNeedsAttentionEntry {
  item: SettingsNeedsAttentionItem
  dismissed: boolean
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
  /** Whether the speech module can use the provider now. Without it, the provider shows as its own item, not the speech. */
  providerUsable: boolean
  /** The fields that the speech lacks before it can speak. */
  missing: MissingSpeechField[]
  /** The empty fields that a catalog fills after it loads. */
  pending: MissingSpeechField[]
  /** The developer tools make the list treat this speech as one without a voice. */
  simulated: boolean
}

/** The provider of one module selection, as the list sees it. The developer tools show it. */
export interface ModuleSelectionState {
  /** `<character id>:<module>`, or `hearing` for the Hearing module, which is the same for every character. */
  key: string
  /** The character that selects the provider. It is empty for Hearing. */
  characterId?: string
  /** The name of the character. */
  characterName?: string
  /** The localized title of the module. */
  moduleTitle: string
  /** The icon of the module. */
  icon: string
  /** The selected provider. */
  provider: string
  /** The localized name of the provider, when the provider is known. */
  providerName?: string
  /** Whether the module can use the provider. `selectionStateOf` tells how. */
  state: SelectionState
  /** The developer tools make the list treat this selection as unusable. */
  simulated: boolean
}

/** The voice input, as the list sees it. The developer tools show it. */
export interface VoiceInputState {
  /** Whether the microphone preference is on. */
  microphoneOn: boolean
  /** The Hearing input mode. */
  mode: HearingInputMode
  /** Whether Hearing has a transcription provider and a model. */
  configured: boolean
  /** The developer tools make the list treat voice input as on in the Always on mode, without transcription. */
  simulated: boolean
}

/**
 * How a module can use the provider of a selection:
 * - `usable`: the module page lists the provider, and the provider has no provider item.
 * - `provider-item`: the provider has a provider item, which reports it.
 * - `awaiting-check`: the provider is added, of the right kind, and not listed. The page lists it after a check passes.
 *   A check that fails gives a provider item. Until a check runs, it is unknown if the provider works.
 * - `unusable`: nothing else reports it. The provider is not added, is of another kind, or no longer exists, for example
 *   after an update removed it.
 */
export type SelectionState = 'usable' | 'provider-item' | 'awaiting-check' | 'unusable'

/** Classifies a module selection. See `SelectionState`. */
export function selectionStateOf(facts: {
  /** The provider has a provider item. */
  hasProviderItem: boolean
  /** The module page lists the provider. */
  listed: boolean
  /** The provider exists, and it is of the kind of the module. */
  ofModuleKind: boolean
  /** The person added the provider. */
  added: boolean
}): SelectionState {
  if (facts.hasProviderItem)
    return 'provider-item'
  if (facts.listed)
    return 'usable'
  if (facts.ofModuleKind && facts.added)
    return 'awaiting-check'
  return 'unusable'
}

// The developer tools set these to test the list. The settings home and the developer tools share them in one window.
// They end when the app quits.
/** The characters whose speech the list treats as one without a voice. */
const simulatedSpeechIds = shallowRef<ReadonlySet<string>>(new Set())
/** The module selections that the list treats as unusable, by `ModuleSelectionState.key`. */
const simulatedUnusableKeys = shallowRef<ReadonlySet<string>>(new Set())
/** Whether the list treats voice input as on without transcription. */
const simulatedVoiceInputGap = shallowRef(false)

/** A copy of a set, with a key added or removed. */
function toggledSet(set: ReadonlySet<string>, key: string, included: boolean): ReadonlySet<string> {
  const next = new Set(set)
  if (included)
    next.add(key)
  else
    next.delete(key)
  return next
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

/** The modules that a character selects for itself. Hearing is the same for every character. */
const CHARACTER_MODULES = ['consciousness', 'speech', 'vision'] as const

/** The provider kind of each module. */
const MODULE_KINDS: Record<Module, string> = {
  consciousness: 'chat',
  speech: 'speech',
  hearing: 'transcription',
  vision: 'vision',
}

/** The page that selects the transcription provider of Hearing. Hearing is the same for every character. */
const HEARING_ROUTE = '/settings/modules/hearing/transcriber'

/**
 * The row that selects the provider of each module: in the character editor for the modules that a character selects,
 * and the list of providers on the Hearing page for Hearing. The keys are the markers that the settings search scan gives
 * these rows.
 */
const PROVIDER_ROWS: Record<Module, string> = {
  consciousness: 'settings.pages.card.chat.provider',
  speech: 'settings.pages.card.speech.provider',
  vision: 'settings.pages.card.vision.provider',
  hearing: 'settings.pages.providers.title',
}

/** The row that selects the transcription model on the Hearing page. It shows once a provider is selected. */
const HEARING_MODEL_ROW = 'settings.pages.modules.consciousness.sections.section.provider-model-selection.title'

/** The row of each speech field in the character editor. */
const SPEECH_FIELD_ROWS: Record<MissingSpeechField, string> = {
  model: 'settings.pages.card.speech.model',
  voice: 'settings.pages.card.speech.voice',
}

/** The section of a provider page that holds its required fields, such as the API key. */
const PROVIDER_BASIC_ROW = 'settings.pages.providers.common.section.basic.title'

/** The character editor of a character. Its `modules` section holds the module selections. */
function characterEditorPathOf(characterId: string) {
  return `/settings/airi-card/${encodeURIComponent(characterId)}/edit`
}

/** The item id of the speech of a character. */
function speechItemIdOf(characterId: string) {
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
 *   - selections whose provider the module cannot select, for example a provider that was removed.
 *   - characters whose speech has a usable provider, but no model or no voice. Their replies stay text only.
 *   - voice input that listens all the time, while Hearing has no transcription provider or model.
 * - `entries`: every problem, and whether the person dismissed it. The developer tools use it.
 * - `dismiss(id)`: hides a problem on this device until its cause changes.
 * - `restoreDismissed(id?)`: shows a dismissed problem again, or all of them without an id. The developer tools use it.
 * - `characterSpeech`, `moduleSelections`, and `voiceInput`: the states that the list reads. The developer tools show them.
 * - `setSimulatedSpeechGap`, `setSimulatedUnusable`, and `setSimulatedVoiceInputGap`: make the list show a problem on purpose,
 *   to test it. The developer tools use them.
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
  const audioDevice = useSettingsAudioDevice()
  /** The fingerprint of the cause at the time of the dismissal, by item id. */
  const dismissed = useLocalStorage<Record<string, string>>('settings/needs-attention/dismissed', {})

  function listOf(names: string[]) {
    return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(names)
  }

  function moduleTitleOf(module: Module) {
    return t(`settings.pages.modules.${module}.title`)
  }

  function providerNameOf(provider: string) {
    return providersStore.availableProvidersMetadata.find(entry => entry.id === provider)?.localizedName
  }

  function characterNameOf(characterId: string) {
    return cardStore.cards.get(characterId)?.name || characterId
  }

  const router = useRouter()

  /**
   * A page that opens at the setting to change and highlights it, as a search result opens it. `query` names the part of
   * the page to show first, such as the `modules` section of the character editor. A page without that setting, such as
   * a provider page without a basic section, opens without the target, so it shows no notice of a missing setting.
   */
  function settingLocationOf(path: string, setting: string, query: Record<string, string> = {}) {
    const meta = router.resolve(path).matched.at(-1)?.meta as SettingsSearchRouteMeta | undefined
    const target = meta?.searchKeys?.includes(setting) ? { [SETTINGS_SEARCH_QUERY]: setting } : {}
    return router.resolve({ path, query: { ...query, ...target } }).fullPath
  }

  /**
   * The row that selects the provider of a module selection. A character keeps its own selection, and its editor shows
   * and changes it, also for the active character. The module pages show the selection of the running modules instead.
   */
  function providerRowOf(characterId: string | undefined, module: Module) {
    return characterId === undefined
      ? settingLocationOf(HEARING_ROUTE, PROVIDER_ROWS[module])
      : settingLocationOf(characterEditorPathOf(characterId), PROVIDER_ROWS[module], { section: 'modules' })
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

  /** The providers that each module can select, as its settings page lists them. */
  const moduleProviderIds = computed<Record<Module, ReadonlySet<string>>>(() => ({
    consciousness: new Set(providersStore.moduleChatProvidersMetadata.map(entry => entry.id)),
    speech: new Set(providersStore.moduleSpeechProvidersMetadata.map(entry => entry.id)),
    hearing: new Set(providersStore.moduleTranscriptionProvidersMetadata.map(entry => entry.id)),
    vision: new Set(providersStore.moduleVisionProvidersMetadata.map(entry => entry.id)),
  }))

  /**
   * Whether the provider registry has loaded. It always holds the built-in providers, so an empty list means that it is
   * still loading. Until then, every list of providers is empty, and no selection can be called unusable.
   */
  const providersLoaded = computed(() => providersStore.availableProvidersMetadata.length > 0)

  /** The providers of the kind of each module, whatever their state. A provider that no longer exists is in none. */
  const moduleKindProviderIds = computed<Record<Module, ReadonlySet<string>>>(() => ({
    consciousness: new Set(providersStore.allChatProvidersMetadata.map(entry => entry.id)),
    speech: new Set(providersStore.allAudioSpeechProvidersMetadata.map(entry => entry.id)),
    hearing: new Set(providersStore.allAudioTranscriptionProvidersMetadata.map(entry => entry.id)),
    vision: new Set(providersStore.allVisionProvidersMetadata.map(entry => entry.id)),
  }))

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
      to: settingLocationOf(providerSettingsRouteOf(metadata), PROVIDER_BASIC_ROW),
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

  /** The providers that have a provider item. The other items leave these providers to it. */
  const providerItemIds = computed(() => new Set(providerProblems.value.map(problem => problem.item.id)))

  /** Whether a module can use a provider now: its settings page lists the provider, and the provider has no provider item. */
  function usable(module: Module, provider: string) {
    return moduleProviderIds.value[module].has(provider) && !providerItemIds.value.has(provider)
  }

  /** The module selections with a provider: each module of every character, and the Hearing module. */
  const moduleSelections = computed(() => {
    const selections = [
      ...[...cardStore.characterModules].flatMap(([characterId, modules]) => CHARACTER_MODULES.map(module => ({
        characterId: characterId as string | undefined,
        module: module as Module,
        provider: modules[module].provider,
      }))),
      { characterId: undefined, module: 'hearing' as Module, provider: hearingStore.activeTranscriptionProvider },
    ]
    return selections
      .filter(({ provider }) => provider && provider !== 'speech-noop')
      .map(({ characterId, module, provider }) => {
        const key = characterId === undefined ? module : `${characterId}:${module}`
        const state = selectionStateOf({
          hasProviderItem: providerItemIds.value.has(provider),
          listed: moduleProviderIds.value[module].has(provider),
          ofModuleKind: moduleKindProviderIds.value[module].has(provider),
          added: !!providerConfigStore.addedProviders[provider],
        })
        return {
          selection: {
            key,
            characterId,
            characterName: characterId === undefined ? undefined : characterNameOf(characterId),
            moduleTitle: moduleTitleOf(module),
            icon: providerKindIconOf(MODULE_KINDS[module]),
            provider,
            providerName: providerNameOf(provider),
            state,
            simulated: simulatedUnusableKeys.value.has(key),
          } satisfies ModuleSelectionState,
          module,
        }
      })
  })

  /**
   * Selections whose provider the module cannot select, for example a provider that was removed or was never added.
   * A character keeps such a selection, because the person can add the provider again.
   * An added provider shows as a provider item after its check instead.
   */
  const unavailableProviderProblems = computed(() => moduleSelections.value.flatMap(({ selection, module }): Problem[] => {
    if (!selection.simulated && (selection.state !== 'unusable' || !providersLoaded.value))
      return []

    const providerName = selection.providerName ?? selection.provider
    return [{
      item: {
        id: `provider-unavailable:${selection.key}`,
        title: selection.characterName === undefined
          ? t('settings.needs-attention.module-provider-unavailable', { module: selection.moduleTitle })
          : t('settings.needs-attention.character-provider-unavailable', { name: selection.characterName, module: selection.moduleTitle }),
        detail: selection.simulated
          ? [providerName, t('settings.needs-attention.simulated')].join(' · ')
          : t('settings.needs-attention.provider-not-listed', { provider: providerName }),
        fallbackIcon: selection.icon,
        modules: [selection.moduleTitle],
        blocking: true,
        to: providerRowOf(selection.characterId, module),
      },
      fingerprint: fingerprintOf(`${module}\n${selection.provider}${selection.simulated ? '\nsimulated' : ''}`),
    }]
  }))

  /** The speech of every character, resolved as a reply resolves it. */
  const characterSpeech = computed(() => [...cardStore.characterModules].map(([id, modules]): CharacterSpeechState => {
    const { provider } = modules.speech
    const runtime = providersStore.providerRuntimeState[provider]
    const status = speechFieldStatus(
      modules.speech,
      providerConfigStore.getProviderConfig(provider) ?? {},
      () => runtime?.modelStatus === 'loading' ? undefined : (runtime?.defaultModel ?? null),
      speechStore.voiceCatalogStatus[provider]?.loading ?? false,
    )
    return {
      id,
      name: characterNameOf(id),
      provider,
      providerName: providerNameOf(provider),
      providerUsable: usable('speech', provider),
      missing: status.missing,
      pending: status.pending,
      simulated: simulatedSpeechIds.value.has(id),
    }
  }))

  /**
   * Characters whose speech has a usable provider, but no model or no voice.
   * Their replies stay text only, and nothing else tells the person why.
   * A provider that the speech module cannot use shows as its own item instead.
   */
  const speechProblems = computed(() => characterSpeech.value.flatMap((speech): Problem[] => {
    const missing: MissingSpeechField[] = speech.simulated ? ['voice'] : speech.providerUsable ? speech.missing : []
    const fieldsKey = speechFieldsKeyOf(missing)
    if (!fieldsKey)
      return []

    const selection = cardStore.characterModules.get(speech.id)?.speech
    const cause = speech.simulated ? t('settings.needs-attention.simulated') : speech.providerName
    return [{
      item: {
        id: speechItemIdOf(speech.id),
        title: t(`settings.needs-attention.speech-no-${fieldsKey}`, { name: speech.name }),
        detail: [t('settings.needs-attention.text-only'), cause].filter(Boolean).join(' · '),
        fallbackIcon: providerKindIconOf('speech'),
        modules: [moduleTitleOf('speech')],
        blocking: true,
        // The first empty field: the model, and then the voice, which the model offers.
        to: settingLocationOf(characterEditorPathOf(speech.id), SPEECH_FIELD_ROWS[missing[0] ?? 'voice'], { section: 'modules' }),
      },
      fingerprint: fingerprintOf(`${JSON.stringify(selection)}\n${missing.join(',')}${speech.simulated ? '\nsimulated' : ''}`),
    }]
  }))

  const voiceInput = computed<VoiceInputState>(() => ({
    microphoneOn: audioDevice.enabled,
    mode: hearingStore.inputMode,
    configured: hearingStore.configured,
    simulated: simulatedVoiceInputGap.value,
  }))

  /**
   * Voice input that listens all the time, while Hearing has no transcription provider or model.
   * Speech then starts no input, and nothing tells the person why.
   * Push to Talk and dictation explain it when the person presses them, so they do not show here.
   */
  const hearingProblems = computed((): Problem[] => {
    const provider = hearingStore.activeTranscriptionProvider
    const { microphoneOn, mode, configured, simulated } = voiceInput.value
    if (!simulated) {
      if (!microphoneOn || !startsInputOnSpeech(mode) || configured)
        return []
      // A provider that the module cannot use shows as its own item.
      if (provider && !usable('hearing', provider))
        return []
    }

    return [{
      item: {
        id: 'hearing',
        title: t(provider ? 'settings.needs-attention.hearing-no-model' : 'settings.needs-attention.hearing-no-provider'),
        detail: [t('settings.needs-attention.not-transcribed'), simulated ? t('settings.needs-attention.simulated') : ''].filter(Boolean).join(' · '),
        fallbackIcon: providerKindIconOf('transcription'),
        modules: [moduleTitleOf('hearing')],
        blocking: true,
        to: settingLocationOf(HEARING_ROUTE, provider ? HEARING_MODEL_ROW : PROVIDER_ROWS.hearing),
      },
      fingerprint: fingerprintOf(`${provider}\n${hearingStore.activeTranscriptionModel}${simulated ? '\nsimulated' : ''}`),
    }]
  })

  const problems = computed(() => [
    ...providerProblems.value,
    ...unavailableProviderProblems.value,
    ...speechProblems.value,
    ...hearingProblems.value,
  ])

  /** Every problem, in the order of the list: blocking items first, then by title. */
  const entries = computed<SettingsNeedsAttentionEntry[]>(() => problems.value
    .map(problem => ({
      item: problem.item,
      dismissed: dismissed.value[problem.item.id] === problem.fingerprint,
    }))
    .sort((left, right) => Number(right.item.blocking) - Number(left.item.blocking) || left.item.title.localeCompare(right.item.title)))

  const items = computed<SettingsNeedsAttentionItem[]>(() => entries.value
    .filter(entry => !entry.dismissed)
    .map(entry => entry.item))

  function dismiss(id: string) {
    const problem = problems.value.find(entry => entry.item.id === id)
    if (problem)
      dismissed.value = { ...dismissed.value, [id]: problem.fingerprint }
  }

  function restoreDismissed(id?: string) {
    dismissed.value = id === undefined
      ? {}
      : Object.fromEntries(Object.entries(dismissed.value).filter(([entry]) => entry !== id))
  }

  /** Makes the list treat the speech of a character as one without a voice, or stops it. The developer tools use it. */
  function setSimulatedSpeechGap(id: string, simulated: boolean) {
    simulatedSpeechIds.value = toggledSet(simulatedSpeechIds.value, id, simulated)
  }

  /** Makes the list treat a module selection as unusable, or stops it. The developer tools use it. */
  function setSimulatedUnusable(key: string, simulated: boolean) {
    simulatedUnusableKeys.value = toggledSet(simulatedUnusableKeys.value, key, simulated)
  }

  /** Makes the list treat voice input as on without transcription, or stops it. The developer tools use it. */
  function setSimulatedVoiceInputGap(simulated: boolean) {
    simulatedVoiceInputGap.value = simulated
  }

  return {
    items,
    entries,
    dismiss,
    restoreDismissed,
    characterSpeech,
    setSimulatedSpeechGap,
    moduleSelections: computed(() => moduleSelections.value.map(({ selection }) => selection)),
    setSimulatedUnusable,
    voiceInput,
    setSimulatedVoiceInputGap,
  }
}
