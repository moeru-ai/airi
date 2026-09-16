<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'
import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'
import type { VoiceInfo } from '@proj-airi/stage-ui/stores/providers/provider'
import type { Ref } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '@proj-airi/stage-ui/constants/prompts/artistry-instruction'
import { resolveModuleSelection } from '@proj-airi/stage-ui/services/airi-card-modules'
import { applyAiriCardEditorModules, getAiriCardEditorModuleSettings, safeParseAiriCardDraft, serializeAiriCardEditorDraft } from '@proj-airi/stage-ui/services/airi-card/editor'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ArtistryFields from './artistry-fields.vue'
import BehaviorFields from './behavior-fields.vue'
import DiscardChangesDialog from './discard-changes-dialog.vue'
import IdentityFields from './identity-fields.vue'
import ModuleFields from './module-fields.vue'
import PromptFields from './prompt-fields.vue'

import { createDraftInitializationCoordinator } from './draft-initialization'

interface Props {
  cardId?: string // If provided, edit mode; otherwise create mode
  initialTab?: string
}

interface LegacyArtistrySettings {
  provider?: string
  model?: string
  promptPrefix?: string
  widgetInstruction?: string
  options?: Record<string, unknown>
  spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget'
  autonomousEnabled?: boolean
  autonomousThreshold?: number
}

type AiriExtensionWithLegacyArtistry = AiriExtension & {
  artistry?: LegacyArtistrySettings
  modules?: AiriExtension['modules'] & {
    artistry?: LegacyArtistrySettings
  }
}

const props = defineProps<Props>()
const modelValue = defineModel<boolean>({ required: true })

const { t } = useI18n()
const { trackCardEdited } = useAnalytics()
const cardStore = useAiriCardStore()
const consciousnessStore = useConsciousnessStore()
const visionStore = useVisionStore()
const providersStore = useProviderStore()
const displayModelsStore = useDisplayModelsStore()

const consciousnessProvider = computed(() => cardStore.moduleDefaults?.consciousness.provider ?? '')
const visionProvider = computed(() => cardStore.moduleDefaults?.vision.provider ?? '')
const speechProvider = computed(() => cardStore.moduleDefaults?.speech.provider ?? '')
const { displayModels } = storeToRefs(displayModelsStore)

// Determine if we're in edit mode
const isEditMode = computed(() => !!props.cardId)
const isEditingActiveCard = computed(() => isEditMode.value && props.cardId === cardStore.activeCardId)

// Modules configuration
const selectedConsciousnessProvider = ref<string>('')
const selectedConsciousnessModel = ref<string>('')
const selectedVisionProvider = ref<string>('')
const selectedVisionModel = ref<string>('')
const selectedSpeechProvider = ref<string>('')
const selectedSpeechModel = ref<string>('')
const selectedSpeechVoiceId = ref<string>('')
const previewVoices = ref<VoiceInfo[]>([])
const selectedDisplayModelId = ref<string>('')
const draftInitialization = createDraftInitializationCoordinator()

// NOTICE:
// The editor needs a non-empty option value for inherited settings.
// Reka ComboboxItem rejects an empty-string item value.
// Source/context: packages/ui/src/components/form/combobox/combobox.vue.
// Removal condition: delete this mapping when Reka accepts empty item values.
const inheritGlobalSettingOptionValue = '__airi-inherit-global-setting__'

function createInheritableSelection(selection: Ref<string>) {
  return computed({
    get: () => selection.value || inheritGlobalSettingOptionValue,
    set: (value: string) => {
      selection.value = value === inheritGlobalSettingOptionValue ? '' : value
    },
  })
}

const consciousnessProviderSelection = createInheritableSelection(selectedConsciousnessProvider)
const consciousnessModelSelection = createInheritableSelection(selectedConsciousnessModel)
const visionProviderSelection = createInheritableSelection(selectedVisionProvider)
const visionModelSelection = createInheritableSelection(selectedVisionModel)
const speechProviderSelection = createInheritableSelection(selectedSpeechProvider)
const speechModelSelection = createInheritableSelection(selectedSpeechModel)
const speechVoiceSelection = createInheritableSelection(selectedSpeechVoiceId)
const displayModelSelection = createInheritableSelection(selectedDisplayModelId)

// Artistry configuration
const selectedArtistryProvider = ref<string>('')
const artistryProviderSelection = createInheritableSelection(selectedArtistryProvider)
const selectedArtistryModel = ref<string>('')
const selectedArtistryPromptPrefix = ref<string>('')
const selectedArtistryWidgetInstruction = ref<string>('')
const selectedArtistrySpawnMode = ref<'bg' | 'widget' | 'inline' | 'bg_widget'>('bg_widget')
const selectedArtistryAutonomousEnabled = ref<boolean>(false)
const selectedArtistryAutonomousThreshold = ref<number>(70)
const selectedArtistryConfigStr = ref<string>('{\n  \n}')
let isInitializingModuleSelections = false
let hasLoadedModuleOptions = false

interface ModuleSelectOption {
  value: string
  label: string
}

function withInheritGlobalSetting(options: ModuleSelectOption[], selected = ''): ModuleSelectOption[] {
  // Imported ids remain visible even when their provider is not configured here.
  const missingSelection = selected && !options.some(option => option.value === selected)
    ? [{ value: selected, label: selected }]
    : []
  return [
    { value: inheritGlobalSettingOptionValue, label: t('settings.pages.card.creation.inherit_global_settings') },
    ...options,
    ...missingSelection,
  ]
}

// Computed: available display model options
const displayModelOptions = computed(() =>
  withInheritGlobalSetting(displayModels.value.map(model => ({
    value: model.id,
    label: model.name,
  })), selectedDisplayModelId.value),
)

// Computed: available consciousness provider options
const consciousnessProviderOptions = computed(() => {
  return withInheritGlobalSetting(providersStore.configuredChatProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  })), selectedConsciousnessProvider.value)
})

// Computed: available consciousness models options
const consciousnessModelOptions = computed(() => {
  const provider = selectedConsciousnessProvider.value || consciousnessProvider.value
  if (!provider)
    return withInheritGlobalSetting([], selectedConsciousnessModel.value)
  const models = providersStore.getModelsForProvider(provider)
  return withInheritGlobalSetting(models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  })), selectedConsciousnessModel.value)
})

// Computed: available vision provider options
const visionProviderOptions = computed(() => {
  return withInheritGlobalSetting(providersStore.configuredVisionProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  })), selectedVisionProvider.value)
})

// Computed: available vision models options
const visionModelOptions = computed(() => {
  const provider = selectedVisionProvider.value || visionProvider.value
  if (!provider)
    return withInheritGlobalSetting([], selectedVisionModel.value)
  const models = providersStore.getModelsForProvider(provider)
  return withInheritGlobalSetting(models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  })), selectedVisionModel.value)
})

// Computed: available speech provider options
const speechProviderOptions = computed(() => {
  return withInheritGlobalSetting(providersStore.configuredSpeechProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  })), selectedSpeechProvider.value)
})

// Computed: available speech models options
const speechModelOptions = computed(() => {
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (!provider)
    return withInheritGlobalSetting([], selectedSpeechModel.value)
  const models = providersStore.getModelsForProvider(provider)
  return withInheritGlobalSetting(models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  })), selectedSpeechModel.value)
})

// Computed: available speech voices options
const speechVoiceOptions = computed(() => {
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (!provider)
    return withInheritGlobalSetting([], selectedSpeechVoiceId.value)
  return withInheritGlobalSetting(previewVoices.value.map(voice => ({
    value: voice.id,
    label: voice.name || voice.id,
  })), selectedSpeechVoiceId.value)
})

// Computed: available artistry provider options
const artistryProviderOptions = computed(() => {
  return withInheritGlobalSetting([
    { value: 'none', label: 'None (Disabled)' },
    { value: 'comfyui', label: 'ComfyUI' },
    ...(isCustomProvidersDisabled()
      ? []
      : [
          { value: 'replicate', label: 'Replicate' },
          { value: 'nanobanana', label: 'Nano Banana' },
        ]),
  ], selectedArtistryProvider.value)
})

async function loadSelectedModuleOptions() {
  if (hasLoadedModuleOptions)
    return

  hasLoadedModuleOptions = true
  const loads: Promise<unknown>[] = []
  const consciousnessProviderId = selectedConsciousnessProvider.value || consciousnessProvider.value
  if (consciousnessProviderId)
    loads.push(consciousnessStore.loadModelsForProvider(consciousnessProviderId))

  const visionProviderId = selectedVisionProvider.value || visionProvider.value
  if (visionProviderId)
    loads.push(visionStore.loadModelsForProvider(visionProviderId))

  const speechProviderId = selectedSpeechProvider.value || speechProvider.value
  if (speechProviderId) {
    if (providersStore.supportsModelListing(speechProviderId))
      loads.push(providersStore.fetchModelsForProvider(speechProviderId))
  }

  try {
    await Promise.all(loads)
  }
  catch (error) {
    hasLoadedModuleOptions = false
    throw error
  }
}

watch(selectedArtistryProvider, (provider, previous) => {
  if (modelValue.value && !isInitializingModuleSelections && provider !== previous)
    selectedArtistryModel.value = ''
}, { flush: 'sync' })

// Watch consciousness provider changes and reload models
watch(selectedConsciousnessProvider, async (newProvider, oldProvider) => {
  if (modelValue.value && !isInitializingModuleSelections && newProvider !== oldProvider) {
    selectedConsciousnessModel.value = ''
    await consciousnessStore.loadModelsForProvider(newProvider || consciousnessProvider.value)
  }
}, { flush: 'sync' })

// Watch vision provider changes and reload models
watch(selectedVisionProvider, async (newProvider, oldProvider) => {
  if (modelValue.value && !isInitializingModuleSelections && newProvider !== oldProvider) {
    selectedVisionModel.value = ''
    await visionStore.loadModelsForProvider(newProvider || visionProvider.value)
  }
}, { flush: 'sync' })

// Watch speech provider changes and reload models/voices
watch(selectedSpeechProvider, async (newProvider, oldProvider) => {
  if (modelValue.value && !isInitializingModuleSelections && newProvider !== oldProvider) {
    selectedSpeechModel.value = ''
    selectedSpeechVoiceId.value = ''
    const provider = newProvider || speechProvider.value
    if (provider && providersStore.supportsModelListing(provider))
      await providersStore.fetchModelsForProvider(provider)
  }
}, { flush: 'sync' })

// Reset voice when speech model changes (different models may have different voices)
watch(selectedSpeechModel, (newModel, oldModel) => {
  // Only reset if model actually changed and we're not initializing
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (modelValue.value && !isInitializingModuleSelections && oldModel !== undefined && newModel !== oldModel && provider) {
    selectedSpeechVoiceId.value = ''
  }
}, { flush: 'sync' })

// Tab type definition
interface Tab {
  id: string
  label: string
  icon: string
}

// Active tab ID state
const activeTabId = shallowRef('')

// Tabs for card details
const tabs = computed<Tab[]>(() => [
  { id: 'identity', label: t('settings.pages.card.creation.identity'), icon: 'i-solar:emoji-funny-square-bold-duotone' },
  { id: 'behavior', label: t('settings.pages.card.creation.behavior'), icon: 'i-solar:chat-round-line-bold-duotone' },
  { id: 'modules', label: t('settings.pages.card.modules'), icon: 'i-solar:widget-4-bold-duotone' },
  { id: 'artistry', label: t('settings.pages.modules.artistry.title'), icon: 'i-solar:gallery-bold-duotone' },
  { id: 'settings', label: t('settings.pages.card.creation.settings'), icon: 'i-solar:settings-bold-duotone' },
])

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.value.some(tab => tab.id === activeTabId.value)) {
      if (props.initialTab && tabs.value.some(tab => tab.id === props.initialTab))
        return props.initialTab
      return tabs.value[0]?.id || ''
    }
    return activeTabId.value
  },
  set: (value: string) => {
    activeTabId.value = value
  },
})

async function selectTab(tabId: string) {
  activeTab.value = tabId
  if (tabId === 'modules')
    await loadSelectedModuleOptions()
}

// Preview discovery never commits runtime speech state. Closing the dialog or
// changing its selection invalidates the response, including in-flight RPCs.
watch([
  () => modelValue.value && activeTab.value === 'modules',
  () => selectedSpeechProvider.value || speechProvider.value,
  () => selectedSpeechModel.value || ((selectedSpeechProvider.value || speechProvider.value) === speechProvider.value
    ? cardStore.moduleDefaults?.speech.model
    : undefined),
], async ([open, provider, model], _, onCleanup) => {
  let current = true
  onCleanup(() => {
    current = false
  })
  previewVoices.value = []
  if (!open || !provider)
    return
  try {
    const config = providersStore.getVoiceCatalogConfiguration(provider)
    const voices = await providersStore.listProviderVoices(provider, model || undefined, config)
    if (current)
      previewVoices.value = voices ?? []
  }
  catch (error) {
    if (current)
      console.error('Failed to load card preview voices:', errorMessageFrom(error))
  }
}, { immediate: true })

// Reset active tab when dialog opens
watch(modelValue, (isOpen) => {
  if (isOpen) {
    if (props.initialTab && tabs.value.some(tab => tab.id === props.initialTab))
      activeTabId.value = props.initialTab
    else
      activeTabId.value = '' // Let computed handle default
  }
})

// Check for errors, and save built Cards :

const showError = shallowRef(false)
const errorMessage = shallowRef('')
const showDiscardChanges = shallowRef(false)
const initialDraftSignature = shallowRef('')

function currentDraftSignature(card: Card): string {
  return serializeAiriCardEditorDraft(toRaw(card), {
    consciousnessProvider: selectedConsciousnessProvider.value,
    consciousnessModel: selectedConsciousnessModel.value,
    visionProvider: selectedVisionProvider.value,
    visionModel: selectedVisionModel.value,
    speechProvider: selectedSpeechProvider.value,
    speechModel: selectedSpeechModel.value,
    speechVoiceId: selectedSpeechVoiceId.value,
    displayModelId: selectedDisplayModelId.value,
    artistryProvider: selectedArtistryProvider.value,
    artistryModel: selectedArtistryModel.value,
    artistryPromptPrefix: selectedArtistryPromptPrefix.value,
    artistryWidgetInstruction: selectedArtistryWidgetInstruction.value,
    artistrySpawnMode: selectedArtistrySpawnMode.value,
    artistryAutonomousEnabled: selectedArtistryAutonomousEnabled.value,
    artistryAutonomousThreshold: selectedArtistryAutonomousThreshold.value,
    artistryConfig: selectedArtistryConfigStr.value,
  })
}

async function saveCard(card: Card, activate: boolean): Promise<boolean> {
  const defaults = cardStore.moduleDefaults
  if (defaults) {
    // A card may inherit an unconfigured global module. A different explicit
    // provider must have its own model; global model ids are not portable.
    const missingModel = [
      { selection: { provider: selectedConsciousnessProvider.value, model: selectedConsciousnessModel.value }, defaults: defaults.consciousness },
      { selection: { provider: selectedVisionProvider.value, model: selectedVisionModel.value }, defaults: defaults.vision },
    ].some(({ selection, defaults }) => selection.provider && !resolveModuleSelection(selection, defaults).model)
    if (missingModel) {
      showError.value = true
      errorMessage.value = t('settings.pages.card.creation.errors.model_required')
      return false
    }
  }
  const draftResult = safeParseAiriCardDraft(toRaw(card), selectedArtistryConfigStr.value)
  if (!draftResult.success) {
    showError.value = true
    errorMessage.value = t(`settings.pages.card.creation.errors.${draftResult.error}`)
    return false
  }

  showError.value = false
  const { card: rawCard, artistryOptions } = draftResult.output

  const cardWithModules = applyAiriCardEditorModules(rawCard, {
    consciousness: {
      provider: selectedConsciousnessProvider.value,
      model: selectedConsciousnessModel.value,
    },
    vision: {
      provider: selectedVisionProvider.value,
      model: selectedVisionModel.value,
    },
    speech: {
      provider: selectedSpeechProvider.value,
      model: selectedSpeechModel.value,
      voice_id: selectedSpeechVoiceId.value,
    },
    displayModelId: selectedDisplayModelId.value,
    artistry: {
      provider: selectedArtistryProvider.value,
      model: selectedArtistryModel.value,
      promptPrefix: selectedArtistryPromptPrefix.value,
      widgetInstruction: selectedArtistryWidgetInstruction.value,
      spawnMode: selectedArtistrySpawnMode.value,
      options: artistryOptions,
      autonomousEnabled: selectedArtistryAutonomousEnabled.value,
      autonomousThreshold: selectedArtistryAutonomousThreshold.value,
    },
  })
  let savedCardId: string
  if (isEditMode.value && props.cardId) {
    // Edit mode: update existing card
    if (!await cardStore.updateCard(props.cardId, cardWithModules)) {
      showError.value = true
      errorMessage.value = t('settings.pages.card.card_not_found')
      return false
    }
    savedCardId = props.cardId
    trackCardEdited({ card_id: props.cardId })
  }
  else {
    savedCardId = await cardStore.addCard(cardWithModules, 'scratch')
  }

  if (activate)
    await cardStore.activateCard(savedCardId)

  initialDraftSignature.value = currentDraftSignature(card)
  modelValue.value = false
  return true
}

// Cards data holders :

// Initialize card data - load from existing card if in edit mode
function createCardDraft(): Card {
  return {
    name: t('settings.pages.card.creation.defaults.name'),
    nickname: undefined,
    version: '1.0',
    description: '',
    notes: undefined,
    personality: t('settings.pages.card.creation.defaults.personality'),
    scenario: t('settings.pages.card.creation.defaults.scenario'),
    systemPrompt: t('settings.pages.card.creation.defaults.systemprompt'),
    postHistoryInstructions: t('settings.pages.card.creation.defaults.posthistoryinstructions'),
    greetings: [],
    messageExample: [],
  }
}

function initializeCard(): Card {
  // Extract existing card data if in edit mode
  const existingCard = (isEditMode.value && props.cardId) ? cardStore.getCard(props.cardId) : undefined
  const airiExt = existingCard?.extensions?.airi as AiriExtensionWithLegacyArtistry | undefined

  const moduleSettings = getAiriCardEditorModuleSettings(existingCard)
  selectedConsciousnessProvider.value = moduleSettings.consciousness.provider
  selectedConsciousnessModel.value = moduleSettings.consciousness.model
  selectedVisionProvider.value = moduleSettings.vision.provider
  selectedVisionModel.value = moduleSettings.vision.model
  selectedSpeechProvider.value = moduleSettings.speech.provider
  selectedSpeechModel.value = moduleSettings.speech.model
  selectedSpeechVoiceId.value = moduleSettings.speech.voice_id
  selectedDisplayModelId.value = moduleSettings.displayModelId ?? ''

  // NOTICE: keep legacy `extensions.airi.artistry` fallback so existing cards continue to load.
  const artistrySettings = airiExt?.modules?.artistry || airiExt?.artistry
  selectedArtistryProvider.value = artistrySettings?.provider ?? ''
  selectedArtistryModel.value = artistrySettings?.model || ''
  selectedArtistryPromptPrefix.value = artistrySettings?.promptPrefix || ''
  selectedArtistryWidgetInstruction.value = artistrySettings?.widgetInstruction || DEFAULT_ARTISTRY_WIDGET_INSTRUCTION
  selectedArtistrySpawnMode.value = artistrySettings?.spawnMode || 'bg_widget'
  selectedArtistryAutonomousEnabled.value = artistrySettings?.autonomousEnabled ?? false
  selectedArtistryAutonomousThreshold.value = artistrySettings?.autonomousThreshold ?? 70

  try {
    selectedArtistryConfigStr.value = artistrySettings?.options ? JSON.stringify(artistrySettings.options, null, 2) : ''
  }
  catch {
    selectedArtistryConfigStr.value = ''
  }

  // Return existing card data or defaults
  if (existingCard) {
    return { ...toRaw(existingCard) }
  }

  return createCardDraft()
}

const initialDraftInitialization = draftInitialization.begin()
isInitializingModuleSelections = true
const card = ref<Card>(initializeCard())
isInitializingModuleSelections = false

async function captureDraftBaseline(initialization: number): Promise<void> {
  // Vue flushes the provider/model watchers before nextTick resolves. They have
  // captured this initialization generation by the time we record the baseline.
  await nextTick()
  if (!draftInitialization.isCurrent(initialization))
    return

  initialDraftSignature.value = currentDraftSignature(card.value)
  draftInitialization.finish(initialization)
}

void captureDraftBaseline(initialDraftInitialization)

// Reinitialize when cardId changes or dialog opens
watch(() => [modelValue.value, props.cardId], async () => {
  if (!modelValue.value)
    return

  showError.value = false
  errorMessage.value = ''
  hasLoadedModuleOptions = false
  isInitializingModuleSelections = true
  const initialization = draftInitialization.begin()
  card.value = initializeCard()
  await captureDraftBaseline(initialization)
  isInitializingModuleSelections = false

  if (modelValue.value && activeTab.value === 'modules')
    await loadSelectedModuleOptions()
})

function makeComputed<T extends keyof Card>(key: T) {
  return computed({
    get: () => {
      return card.value[key] ?? ''
    },
    set: (value: string) => {
      // Preserve in-progress whitespace. Trimming on every input event makes
      // multi-word names and prompts collapse while the user is typing.
      card.value[key] = value as Card[T]
    },
  })
}

const cardName = makeComputed('name')
const cardNickname = makeComputed('nickname')
const cardDescription = makeComputed('description')
const cardNotes = makeComputed('notes')

const cardPersonality = makeComputed('personality')
const cardScenario = makeComputed('scenario')
const cardGreetings = computed({
  get: () => card.value.greetings ?? [],
  set: (val: string[]) => {
    card.value.greetings = val || []
  },
})

const cardVersion = makeComputed('version')
const cardSystemPrompt = makeComputed('systemPrompt')
const cardPostHistoryInstructions = makeComputed('postHistoryInstructions')

const hasUnsavedChanges = computed(() =>
  modelValue.value && currentDraftSignature(card.value) !== initialDraftSignature.value,
)

function requestClose() {
  if (hasUnsavedChanges.value) {
    showDiscardChanges.value = true
    return
  }
  modelValue.value = false
}

function handleOpenChange(open: boolean) {
  if (open)
    modelValue.value = true
  else
    requestClose()
}

function discardChanges() {
  showDiscardChanges.value = false
  modelValue.value = false
}
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6" @interact-outside.prevent>
        <div class="w-full flex flex-col gap-5">
          <DialogTitle text-2xl font-normal class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
            {{ isEditMode ? t("settings.pages.card.edit_card") : t("settings.pages.card.create_card") }}
          </DialogTitle>
          <DialogDescription class="sr-only">
            {{ t("settings.pages.card.editor_description") }}
          </DialogDescription>

          <!-- Dialog tabs -->
          <div class="mt-4 overflow-x-auto">
            <div class="border-b border-neutral-200 dark:border-neutral-700">
              <div class="min-w-max flex justify-start -mb-px space-x-1">
                <button
                  v-for="tab in tabs"
                  :key="tab.id"
                  class="px-4 py-2 text-sm font-medium"
                  :class="[
                    activeTab === tab.id
                      ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 dark:border-primary-400'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300',
                  ]"
                  @click="selectTab(tab.id)"
                >
                  <div class="flex items-center gap-1">
                    <div :class="tab.icon" />
                    {{ tab.label }}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Error div -->
          <div v-if="showError" class="w-full rounded-xl bg-red900">
            <p class="w-full p-4">
              {{ errorMessage }}
            </p>
          </div>

          <IdentityFields
            v-if="activeTab === 'identity'"
            v-model:name="cardName"
            v-model:nickname="cardNickname"
            v-model:description="cardDescription"
            v-model:notes="cardNotes"
          />
          <BehaviorFields
            v-else-if="activeTab === 'behavior'"
            v-model:personality="cardPersonality"
            v-model:scenario="cardScenario"
            v-model:greetings="cardGreetings"
          />
          <ModuleFields
            v-else-if="activeTab === 'modules'"
            v-model:consciousness-provider="consciousnessProviderSelection"
            v-model:consciousness-model="consciousnessModelSelection"
            v-model:vision-provider="visionProviderSelection"
            v-model:vision-model="visionModelSelection"
            v-model:speech-provider="speechProviderSelection"
            v-model:speech-model="speechModelSelection"
            v-model:speech-voice-id="speechVoiceSelection"
            v-model:display-model-id="displayModelSelection"
            :consciousness-provider-options="consciousnessProviderOptions"
            :consciousness-model-options="consciousnessModelOptions"
            :vision-provider-options="visionProviderOptions"
            :vision-model-options="visionModelOptions"
            :speech-provider-options="speechProviderOptions"
            :speech-model-options="speechModelOptions"
            :speech-voice-options="speechVoiceOptions"
            :display-model-options="displayModelOptions"
          />
          <PromptFields
            v-else-if="activeTab === 'settings'"
            v-model:system-prompt="cardSystemPrompt"
            v-model:post-history-instructions="cardPostHistoryInstructions"
            v-model:version="cardVersion"
          />
          <ArtistryFields
            v-else-if="activeTab === 'artistry'"
            v-model:selected-artistry-provider="artistryProviderSelection"
            v-model:selected-artistry-model="selectedArtistryModel"
            v-model:selected-artistry-prompt-prefix="selectedArtistryPromptPrefix"
            v-model:selected-artistry-widget-instruction="selectedArtistryWidgetInstruction"
            v-model:selected-artistry-autonomous-enabled="selectedArtistryAutonomousEnabled"
            v-model:selected-artistry-autonomous-threshold="selectedArtistryAutonomousThreshold"
            v-model:selected-artistry-spawn-mode="selectedArtistrySpawnMode"
            v-model:selected-artistry-config-str="selectedArtistryConfigStr"
            :artistry-provider-options="artistryProviderOptions"
          />

          <div class="ml-auto mr-1 flex flex-row gap-2">
            <Button

              icon="i-solar:undo-left-bold-duotone"
              :label="t('settings.pages.card.cancel')"
              @click="requestClose"
            />
            <Button
              icon="i-solar:check-circle-bold-duotone"
              :label="t('settings.pages.card.save')"
              @click="saveCard(card, false)"
            />
            <Button
              v-if="!isEditingActiveCard"

              icon="i-solar:play-circle-bold-duotone"
              :label="t('settings.pages.card.save_and_activate')"
              @click="saveCard(card, true)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DiscardChangesDialog v-model="showDiscardChanges" @discard="discardChanges" />
</template>
