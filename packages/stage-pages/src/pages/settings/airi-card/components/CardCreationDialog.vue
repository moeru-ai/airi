<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'
import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '@proj-airi/stage-ui/constants/prompts/artistry-instruction'
import { applyAiriCardEditorModules, safeParseAiriCardDraft } from '@proj-airi/stage-ui/services/airi-card-editor'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button, FieldInput, FieldValues } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CardCreationTabArtistry from './tabs/CardCreationTabArtistry.vue'

interface Props {
  modelValue: boolean
  cardId?: string // If provided, edit mode; otherwise create mode
  initialTab?: string
}

interface LegacyArtistrySettings {
  provider?: string
  model?: string
  promptPrefix?: string
  widgetInstruction?: string
  options?: Record<string, unknown>
}

type AiriExtensionWithLegacyArtistry = AiriExtension & {
  artistry?: LegacyArtistrySettings
  modules?: AiriExtension['modules'] & {
    artistry?: LegacyArtistrySettings
  }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const modelValue = defineModel<boolean>()

const { t } = useI18n()
const { trackCardEdited } = useAnalytics()
const cardStore = useAiriCardStore()
const consciousnessStore = useConsciousnessStore()
const visionStore = useVisionStore()
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const displayModelsStore = useDisplayModelsStore()
const stageModelStore = useSettingsStageModel()
const artistryStore = useArtistryStore()

const { activeProvider: consciousnessProvider, activeModel: defaultConsciousnessModel } = storeToRefs(consciousnessStore)
const { activeProvider: visionProvider, activeModel: defaultVisionModel } = storeToRefs(visionStore)
const { activeSpeechProvider: speechProvider, activeSpeechModel: defaultSpeechModel, activeSpeechVoiceId: defaultSpeechVoiceId } = storeToRefs(speechStore)
const { displayModels } = storeToRefs(displayModelsStore)
const { stageModelSelected: defaultDisplayModelId } = storeToRefs(stageModelStore)
const { activeProvider: defaultArtistryProvider } = storeToRefs(artistryStore)

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
const selectedDisplayModelId = ref<string>('')

// Artistry configuration
const selectedArtistryProvider = ref<string>('')
const selectedArtistryModel = ref<string>('')
const selectedArtistryPromptPrefix = ref<string>('')
const selectedArtistryWidgetInstruction = ref<string>('')
const selectedArtistrySpawnMode = ref<'bg' | 'widget' | 'inline' | 'bg_widget'>('bg_widget')
const selectedArtistryAutonomousEnabled = ref<boolean>(false)
const selectedArtistryAutonomousThreshold = ref<number>(70)
const selectedArtistryConfigStr = ref<string>('{\n  \n}')
let isInitializingModuleSelections = false
let hasLoadedModuleOptions = false

// Computed: available display model options
const displayModelOptions = computed(() =>
  displayModels.value.map(model => ({
    value: model.id,
    label: model.name,
  })),
)

// Computed: available consciousness provider options
const consciousnessProviderOptions = computed(() => {
  return providersStore.configuredChatProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  }))
})

// Computed: available consciousness models options
const consciousnessModelOptions = computed(() => {
  const provider = selectedConsciousnessProvider.value || consciousnessProvider.value
  if (!provider)
    return []
  const models = providersStore.getModelsForProvider(provider)
  return models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  }))
})

// Computed: available vision provider options
const visionProviderOptions = computed(() => {
  return providersStore.configuredVisionProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  }))
})

// Computed: available vision models options
const visionModelOptions = computed(() => {
  const provider = selectedVisionProvider.value || visionProvider.value
  if (!provider)
    return []
  const models = providersStore.getModelsForProvider(provider)
  return models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  }))
})

// Computed: available speech provider options
const speechProviderOptions = computed(() => {
  return providersStore.configuredSpeechProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  }))
})

// Computed: available speech models options
const speechModelOptions = computed(() => {
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (!provider)
    return []
  const models = providersStore.getModelsForProvider(provider)
  return models.map(model => ({
    value: model.id,
    label: model.name || model.id,
  }))
})

// Computed: available speech voices options
const speechVoiceOptions = computed(() => {
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (!provider)
    return []
  const voices = speechStore.getVoicesForProvider(provider)
  return voices.map(voice => ({
    value: voice.id,
    label: voice.name || voice.id,
  }))
})

// Computed: available artistry provider options
const artistryProviderOptions = computed(() => {
  return [
    { value: 'none', label: 'None (Disabled)' },
    { value: 'comfyui', label: 'ComfyUI' },
    ...(isCustomProvidersDisabled()
      ? []
      : [
          { value: 'replicate', label: 'Replicate' },
          { value: 'nanobanana', label: 'Nano Banana' },
        ]),
  ]
})

async function loadSelectedModuleOptions() {
  if (hasLoadedModuleOptions)
    return

  hasLoadedModuleOptions = true
  const loads: Promise<unknown>[] = []
  if (selectedConsciousnessProvider.value)
    loads.push(consciousnessStore.loadModelsForProvider(selectedConsciousnessProvider.value))

  if (selectedVisionProvider.value)
    loads.push(visionStore.loadModelsForProvider(selectedVisionProvider.value))

  if (selectedSpeechProvider.value) {
    loads.push(speechStore.loadVoicesForProvider(selectedSpeechProvider.value, selectedSpeechModel.value || undefined))
    if (providersStore.supportsModelListing(selectedSpeechProvider.value))
      loads.push(providersStore.fetchModelsForProvider(selectedSpeechProvider.value))
  }

  try {
    await Promise.all(loads)
  }
  catch (error) {
    hasLoadedModuleOptions = false
    throw error
  }
}

// Watch consciousness provider changes and reload models
watch(selectedConsciousnessProvider, async (newProvider, oldProvider) => {
  if (props.modelValue && !isInitializingModuleSelections && oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    await consciousnessStore.loadModelsForProvider(newProvider)
    // Reset model selection to default or empty
    selectedConsciousnessModel.value = ''
  }
})

// Watch vision provider changes and reload models
watch(selectedVisionProvider, async (newProvider, oldProvider) => {
  if (props.modelValue && !isInitializingModuleSelections && oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    await visionStore.loadModelsForProvider(newProvider)
    selectedVisionModel.value = ''
  }
})

// Watch speech provider changes and reload models/voices
watch(selectedSpeechProvider, async (newProvider, oldProvider) => {
  if (props.modelValue && !isInitializingModuleSelections && oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    await speechStore.loadVoicesForProvider(newProvider)
    if (providersStore.supportsModelListing(newProvider)) {
      await providersStore.fetchModelsForProvider(newProvider)
    }
    // Reset model and voice selection
    selectedSpeechModel.value = ''
    selectedSpeechVoiceId.value = ''
  }
})

// Reset voice when speech model changes (different models may have different voices)
watch(selectedSpeechModel, async (newModel, oldModel) => {
  // Only reset if model actually changed and we're not initializing
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (props.modelValue && !isInitializingModuleSelections && oldModel !== undefined && newModel !== oldModel && provider) {
    // Reload voices for the current provider
    await speechStore.loadVoicesForProvider(provider)

    // Reset voice selection to default
    selectedSpeechVoiceId.value = defaultSpeechVoiceId.value || ''
  }
})

// Tab type definition
interface Tab {
  id: string
  label: string
  icon: string
}

// Active tab ID state
const activeTabId = ref('')

// Tabs for card details
const tabs: Tab[] = [
  { id: 'identity', label: t('settings.pages.card.creation.identity'), icon: 'i-solar:emoji-funny-square-bold-duotone' },
  { id: 'behavior', label: t('settings.pages.card.creation.behavior'), icon: 'i-solar:chat-round-line-bold-duotone' },
  { id: 'modules', label: t('settings.pages.card.modules'), icon: 'i-solar:widget-4-bold-duotone' },
  { id: 'artistry', label: t('settings.pages.modules.artistry.title'), icon: 'i-solar:gallery-bold-duotone' },
  { id: 'settings', label: t('settings.pages.card.creation.settings'), icon: 'i-solar:settings-bold-duotone' },
]

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.some(tab => tab.id === activeTabId.value)) {
      if (props.initialTab && tabs.some(tab => tab.id === props.initialTab))
        return props.initialTab
      return tabs[0]?.id || ''
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

// Reset active tab when dialog opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    if (props.initialTab && tabs.some(tab => tab.id === props.initialTab))
      activeTabId.value = props.initialTab
    else
      activeTabId.value = '' // Let computed handle default
  }
})

// Check for errors, and save built Cards :

const showError = ref<boolean>(false)
const errorMessage = ref<string>('')

async function saveCard(card: Card, activate: boolean): Promise<boolean> {
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
      provider: selectedConsciousnessProvider.value || consciousnessProvider.value,
      model: selectedConsciousnessModel.value || defaultConsciousnessModel.value,
    },
    vision: {
      provider: selectedVisionProvider.value || visionProvider.value,
      model: selectedVisionModel.value || defaultVisionModel.value,
    },
    speech: {
      provider: selectedSpeechProvider.value || speechProvider.value,
      model: selectedSpeechModel.value || defaultSpeechModel.value,
      voice_id: selectedSpeechVoiceId.value || defaultSpeechVoiceId.value,
    },
    displayModelId: selectedDisplayModelId.value || defaultDisplayModelId.value,
    artistry: {
      provider: selectedArtistryProvider.value || defaultArtistryProvider.value,
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

  modelValue.value = false // Close this
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

  // Initialize module selections with fallback logic (handles all cases: create, edit with/without extension)
  selectedConsciousnessProvider.value = airiExt?.modules?.consciousness?.provider || consciousnessProvider.value
  selectedConsciousnessModel.value = airiExt?.modules?.consciousness?.model || defaultConsciousnessModel.value
  selectedVisionProvider.value = airiExt?.modules?.vision?.provider || visionProvider.value
  selectedVisionModel.value = airiExt?.modules?.vision?.model || defaultVisionModel.value
  selectedSpeechProvider.value = airiExt?.modules?.speech?.provider || speechProvider.value
  selectedSpeechModel.value = airiExt?.modules?.speech?.model || defaultSpeechModel.value
  selectedSpeechVoiceId.value = airiExt?.modules?.speech?.voice_id || defaultSpeechVoiceId.value
  selectedDisplayModelId.value = airiExt?.modules?.displayModelId || defaultDisplayModelId.value

  // NOTICE: keep legacy `extensions.airi.artistry` fallback so existing cards continue to load.
  const artistrySettings = airiExt?.modules?.artistry || airiExt?.artistry
  selectedArtistryProvider.value = artistrySettings?.provider || defaultArtistryProvider.value
  selectedArtistryModel.value = artistrySettings?.model || ''
  selectedArtistryPromptPrefix.value = artistrySettings?.promptPrefix || ''
  selectedArtistryWidgetInstruction.value = artistrySettings?.widgetInstruction || DEFAULT_ARTISTRY_WIDGET_INSTRUCTION
  selectedArtistrySpawnMode.value = (artistrySettings as any)?.spawnMode || 'bg_widget'
  selectedArtistryAutonomousEnabled.value = (artistrySettings as any)?.autonomousEnabled ?? false
  selectedArtistryAutonomousThreshold.value = (artistrySettings as any)?.autonomousThreshold ?? 70

  try {
    selectedArtistryConfigStr.value = artistrySettings?.options ? JSON.stringify(artistrySettings.options, null, 2) : '{\n  \n}'
  }
  catch {
    selectedArtistryConfigStr.value = '{\n  \n}'
  }

  // Return existing card data or defaults
  if (existingCard) {
    return { ...toRaw(existingCard) }
  }

  return createCardDraft()
}

const card = ref<Card>(createCardDraft())

// Reinitialize when cardId changes or dialog opens
watch(() => [props.modelValue, props.cardId], async () => {
  if (!props.modelValue)
    return

  showError.value = false
  errorMessage.value = ''
  hasLoadedModuleOptions = false
  isInitializingModuleSelections = true
  card.value = initializeCard()
  await nextTick()
  isInitializingModuleSelections = false

  if (props.modelValue && activeTab.value === 'modules')
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

// Helper function to generate placeholder text for default values
function getDefaultPlaceholder(defaultValue: string | undefined): string {
  return defaultValue
    ? `${t('settings.pages.card.creation.use_default')} (${defaultValue})`
    : t('settings.pages.card.creation.use_default_not_configured')
}
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6" @interact-outside.prevent>
        <div class="w-full flex flex-col gap-5">
          <DialogTitle text-2xl font-normal class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
            {{ isEditMode ? t("settings.pages.card.edit_card") : t("settings.pages.card.create_card") }}
          </DialogTitle>

          <!-- Dialog tabs -->
          <div class="mt-4">
            <div class="border-b border-neutral-200 dark:border-neutral-700">
              <div class="flex justify-center -mb-px sm:justify-start space-x-1">
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

          <!-- Actual content -->
          <!-- Identity details -->
          <div v-if="activeTab === 'identity'" class="tab-content ml-auto mr-auto w-95%">
            <p class="mb-3">
              {{ t('settings.pages.card.creation.fields_info.subtitle') }}
            </p>

            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardName" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
              <FieldInput v-model="cardNickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
              <FieldInput v-model="cardDescription" :label="t('settings.pages.card.creation.description')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.description')" />
              <FieldInput v-model="cardNotes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" />
            </div>
          </div>
          <!-- Behavior -->
          <div v-else-if="activeTab === 'behavior'" class="tab-content ml-auto mr-auto w-95%">
            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardPersonality" :label="t('settings.pages.card.personality')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.personality')" />
              <FieldInput v-model="cardScenario" :label="t('settings.pages.card.scenario')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.scenario')" />
              <FieldValues v-model="cardGreetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" />
            </div>
          </div>
          <!-- Modules -->
          <div v-else-if="activeTab === 'modules'" class="tab-content ml-auto mr-auto w-95%">
            <p class="mb-3">
              {{ t('settings.pages.card.creation.modules_info') }}
            </p>

            <div :class="['grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-4', 'ml-auto', 'mr-auto', 'w-90%']">
              <!-- Consciousness Provider -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:brain />
                  {{ t('settings.pages.card.chat.provider') }}
                </label>
                <ComboboxSelect
                  v-model="selectedConsciousnessProvider"
                  :options="consciousnessProviderOptions"
                  :placeholder="getDefaultPlaceholder(consciousnessProvider)"
                  class="w-full"
                />
              </div>

              <!-- Consciousness Model -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:ghost />
                  {{ t('settings.pages.card.consciousness.model') }}
                </label>
                <ComboboxSelect
                  v-model="selectedConsciousnessModel"
                  :options="consciousnessModelOptions"
                  :placeholder="getDefaultPlaceholder(defaultConsciousnessModel)"
                  :disabled="!selectedConsciousnessProvider && !consciousnessProvider"
                  class="w-full"
                />
              </div>

              <!-- Vision Provider -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:eye />
                  {{ t('settings.pages.card.vision.provider') }}
                </label>
                <ComboboxSelect
                  v-model="selectedVisionProvider"
                  :options="visionProviderOptions"
                  :placeholder="getDefaultPlaceholder(visionProvider)"
                  class="w-full"
                />
              </div>

              <!-- Vision Model -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:scan-eye />
                  {{ t('settings.pages.card.vision.model') }}
                </label>
                <ComboboxSelect
                  v-model="selectedVisionModel"
                  :options="visionModelOptions"
                  :placeholder="getDefaultPlaceholder(defaultVisionModel)"
                  :disabled="!selectedVisionProvider && !visionProvider"
                  class="w-full"
                />
              </div>

              <!-- Speech Provider -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:radio />
                  {{ t('settings.pages.card.speech.provider') }}
                </label>
                <ComboboxSelect
                  v-model="selectedSpeechProvider"
                  :options="speechProviderOptions"
                  :placeholder="getDefaultPlaceholder(speechProvider)"
                  class="w-full"
                />
              </div>

              <!-- Speech Model -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:mic />
                  {{ t('settings.pages.card.speech.model') }}
                </label>
                <ComboboxSelect
                  v-model="selectedSpeechModel"
                  :options="speechModelOptions"
                  :placeholder="getDefaultPlaceholder(defaultSpeechModel)"
                  :disabled="!selectedSpeechProvider && !speechProvider"
                  class="w-full"
                />
              </div>

              <!-- Speech Voice -->
              <div :class="['flex', 'flex-col', 'gap-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-lucide:music />
                  {{ t('settings.pages.card.speech.voice') }}
                </label>
                <ComboboxSelect
                  v-model="selectedSpeechVoiceId"
                  :options="speechVoiceOptions"
                  :placeholder="getDefaultPlaceholder(defaultSpeechVoiceId)"
                  :disabled="!selectedSpeechProvider && !speechProvider"
                  class="w-full"
                />
              </div>

              <!-- Display Model (Body) -->
              <div :class="['flex', 'flex-col', 'gap-2', 'sm:col-span-2']">
                <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
                  <div i-solar:ghost-bold-duotone />
                  {{ t('settings.pages.card.body-model') }}
                </label>
                <ComboboxSelect
                  v-model="selectedDisplayModelId"
                  :options="displayModelOptions"
                  :placeholder="getDefaultPlaceholder(defaultDisplayModelId)"
                  class="w-full"
                />
              </div>
            </div>
          </div>
          <!-- Settings -->
          <div v-else-if="activeTab === 'settings'" class="tab-content ml-auto mr-auto w-95%">
            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardSystemPrompt" :label="t('settings.pages.card.systemprompt')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.systemprompt')" />
              <FieldInput v-model="cardPostHistoryInstructions" :label="t('settings.pages.card.posthistoryinstructions')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')" />
              <FieldInput v-model="cardVersion" :label="t('settings.pages.card.creation.version')" :required="true" :description="t('settings.pages.card.creation.fields_info.version')" />
            </div>
          </div>
          <!-- Artistry -->
          <CardCreationTabArtistry
            v-else-if="activeTab === 'artistry'"
            v-model:selected-artistry-provider="selectedArtistryProvider"
            v-model:selected-artistry-model="selectedArtistryModel"
            v-model:selected-artistry-prompt-prefix="selectedArtistryPromptPrefix"
            v-model:selected-artistry-widget-instruction="selectedArtistryWidgetInstruction"
            v-model:selected-artistry-autonomous-enabled="selectedArtistryAutonomousEnabled"
            v-model:selected-artistry-autonomous-threshold="selectedArtistryAutonomousThreshold"
            v-model:selected-artistry-spawn-mode="selectedArtistrySpawnMode"
            v-model:selected-artistry-config-str="selectedArtistryConfigStr"
            :artistry-provider-options="artistryProviderOptions"
            :default-artistry-provider-placeholder="getDefaultPlaceholder(defaultArtistryProvider)"
          />

          <div class="ml-auto mr-1 flex flex-row gap-2">
            <Button

              icon="i-solar:undo-left-bold-duotone"
              :label="t('settings.pages.card.cancel')"
              :disabled="false"
              @click="modelValue = false"
            />
            <Button
              icon="i-solar:check-circle-bold-duotone"
              :label="t('settings.pages.card.save')"
              :disabled="false"
              @click="saveCard(card, false)"
            />
            <Button
              v-if="!isEditingActiveCard"

              icon="i-solar:play-circle-bold-duotone"
              :label="t('settings.pages.card.save_and_activate')"
              :disabled="false"
              @click="saveCard(card, true)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.input-list > * {
    min-width: 45%;
  }

  @media (max-width: 641px) {
  .input-list * {
    min-width: unset;
    width: 100%;
  }
}
</style>
