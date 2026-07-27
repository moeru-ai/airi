<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'
import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '@proj-airi/stage-ui/constants/prompts/artistry-instruction'
import { applyAiriCardEditorModules, safeParseAiriCardDraft, serializeAiriCardEditorDraft } from '@proj-airi/stage-ui/services/airi-card/editor'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
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

import ArtistryFields from './artistryFields.vue'
import BehaviorFields from './behaviorFields.vue'
import DiscardChangesDialog from './discardChangesDialog.vue'
import IdentityFields from './identityFields.vue'
import ModuleFields from './moduleFields.vue'
import PromptFields from './promptFields.vue'

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
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
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
const selectedConsciousnessProvider = shallowRef('')
const selectedConsciousnessModel = shallowRef('')
const selectedVisionProvider = shallowRef('')
const selectedVisionModel = shallowRef('')
const selectedSpeechProvider = shallowRef('')
const selectedSpeechModel = shallowRef('')
const selectedSpeechVoiceId = shallowRef('')
const selectedDisplayModelId = shallowRef('')
const draftInitialization = createDraftInitializationCoordinator()

// Artistry configuration
const selectedArtistryProvider = shallowRef('')
const selectedArtistryModel = shallowRef('')
const selectedArtistryPromptPrefix = shallowRef('')
const selectedArtistryWidgetInstruction = shallowRef('')
const selectedArtistrySpawnMode = shallowRef<'bg' | 'widget' | 'inline' | 'bg_widget'>('bg_widget')
const selectedArtistryAutonomousEnabled = shallowRef(false)
const selectedArtistryAutonomousThreshold = shallowRef(70)
const selectedArtistryConfigStr = shallowRef('{\n  \n}')

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

// Load models for current providers on init
watch(() => [consciousnessProvider.value, visionProvider.value, speechProvider.value], async ([consProvider, visProvider, spProvider]) => {
  if (consProvider) {
    await consciousnessStore.loadModelsForProvider(consProvider)
  }
  if (visProvider) {
    await visionStore.loadModelsForProvider(visProvider)
  }
  if (spProvider) {
    await speechStore.loadVoicesForProvider(spProvider)
    const metadata = providersStore.getProviderMetadata(spProvider)
    if (metadata?.capabilities.listModels) {
      await providersStore.fetchModelsForProvider(spProvider)
    }
  }
}, { immediate: true })

// Watch consciousness provider changes and reload models
watch(selectedConsciousnessProvider, async (newProvider, oldProvider) => {
  if (oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    const effect = draftInitialization.captureWatcherEffect()
    await consciousnessStore.loadModelsForProvider(newProvider)
    if (!draftInitialization.canApplyWatcherEffect(effect))
      return

    // Reset model selection to default or empty
    selectedConsciousnessModel.value = ''
  }
})

// Watch vision provider changes and reload models
watch(selectedVisionProvider, async (newProvider, oldProvider) => {
  if (oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    const effect = draftInitialization.captureWatcherEffect()
    await visionStore.loadModelsForProvider(newProvider)
    if (!draftInitialization.canApplyWatcherEffect(effect))
      return

    selectedVisionModel.value = ''
  }
})

// Watch speech provider changes and reload models/voices
watch(selectedSpeechProvider, async (newProvider, oldProvider) => {
  if (oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    const effect = draftInitialization.captureWatcherEffect()
    await speechStore.loadVoicesForProvider(newProvider)
    const metadata = providersStore.getProviderMetadata(newProvider)
    if (metadata?.capabilities.listModels) {
      await providersStore.fetchModelsForProvider(newProvider)
    }
    if (!draftInitialization.canApplyWatcherEffect(effect))
      return

    // Reset model and voice selection
    selectedSpeechModel.value = ''
    selectedSpeechVoiceId.value = ''
  }
})

// Reset voice when speech model changes (different models may have different voices)
watch(selectedSpeechModel, async (newModel, oldModel) => {
  // Only reset if model actually changed and we're not initializing
  const provider = selectedSpeechProvider.value || speechProvider.value
  if (oldModel !== undefined && newModel !== oldModel && provider) {
    const effect = draftInitialization.captureWatcherEffect()
    // Reload voices for the current provider
    await speechStore.loadVoicesForProvider(provider)
    if (!draftInitialization.canApplyWatcherEffect(effect))
      return

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
const activeTabId = shallowRef('')

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

// Reset active tab when dialog opens
watch(modelValue, (isOpen) => {
  if (isOpen) {
    if (props.initialTab && tabs.some(tab => tab.id === props.initialTab))
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

function saveCard(card: Card, activate: boolean): boolean {
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
    if (!cardStore.updateCard(props.cardId, cardWithModules)) {
      showError.value = true
      errorMessage.value = t('settings.pages.card.card_not_found')
      return false
    }
    savedCardId = props.cardId
    trackCardEdited({ card_id: props.cardId })
  }
  else {
    savedCardId = cardStore.addCard(cardWithModules, 'scratch')
  }

  if (activate)
    cardStore.activeCardId = savedCardId

  initialDraftSignature.value = currentDraftSignature(card)
  modelValue.value = false
  return true
}

// Cards data holders :

// Initialize card data - load from existing card if in edit mode
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
  selectedArtistrySpawnMode.value = artistrySettings?.spawnMode || 'bg_widget'
  selectedArtistryAutonomousEnabled.value = artistrySettings?.autonomousEnabled ?? false
  selectedArtistryAutonomousThreshold.value = artistrySettings?.autonomousThreshold ?? 70

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

const initialDraftInitialization = draftInitialization.begin()
const card = ref<Card>(initializeCard())

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
watch(() => [modelValue.value, props.cardId], () => {
  if (modelValue.value) {
    showError.value = false
    errorMessage.value = ''
    const initialization = draftInitialization.begin()
    card.value = initializeCard()
    void captureDraftBaseline(initialization)
  }
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

function getDefaultPlaceholder(defaultValue: string | undefined): string {
  return defaultValue
    ? `${t('settings.pages.card.creation.use_default')} (${defaultValue})`
    : t('settings.pages.card.creation.use_default_not_configured')
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
                  @click="activeTab = tab.id"
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
            v-model:consciousness-provider="selectedConsciousnessProvider"
            v-model:consciousness-model="selectedConsciousnessModel"
            v-model:vision-provider="selectedVisionProvider"
            v-model:vision-model="selectedVisionModel"
            v-model:speech-provider="selectedSpeechProvider"
            v-model:speech-model="selectedSpeechModel"
            v-model:speech-voice-id="selectedSpeechVoiceId"
            v-model:display-model-id="selectedDisplayModelId"
            :consciousness-provider-options="consciousnessProviderOptions"
            :consciousness-model-options="consciousnessModelOptions"
            :vision-provider-options="visionProviderOptions"
            :vision-model-options="visionModelOptions"
            :speech-provider-options="speechProviderOptions"
            :speech-model-options="speechModelOptions"
            :speech-voice-options="speechVoiceOptions"
            :display-model-options="displayModelOptions"
            :default-consciousness-provider="consciousnessProvider"
            :default-consciousness-model="defaultConsciousnessModel"
            :default-vision-provider="visionProvider"
            :default-vision-model="defaultVisionModel"
            :default-speech-provider="speechProvider"
            :default-speech-model="defaultSpeechModel"
            :default-speech-voice-id="defaultSpeechVoiceId"
            :default-display-model-id="defaultDisplayModelId"
          />
          <PromptFields
            v-else-if="activeTab === 'settings'"
            v-model:system-prompt="cardSystemPrompt"
            v-model:post-history-instructions="cardPostHistoryInstructions"
            v-model:version="cardVersion"
          />
          <ArtistryFields
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
              variant="secondary"
              icon="i-solar:undo-left-bold-duotone"
              :label="t('settings.pages.card.cancel')"
              :disabled="false"
              @click="requestClose"
            />
            <Button
              :variant="isEditingActiveCard ? 'primary' : 'secondary'"
              icon="i-solar:check-circle-bold-duotone"
              :label="t('settings.pages.card.save')"
              :disabled="false"
              @click="saveCard(card, false)"
            />
            <Button
              v-if="!isEditingActiveCard"
              variant="primary"
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
  <DiscardChangesDialog v-model="showDiscardChanges" @discard="discardChanges" />
</template>
