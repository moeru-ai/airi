<script setup lang="ts">
// 角色卡编辑页的核心表单，路由壳只负责把卡片 ID 和当前分区传进来。
import type { Card } from '@proj-airi/ccc'
import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'
import type { VoiceInfo } from '@proj-airi/stage-ui/stores/providers/provider'
import type { Ref } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '@proj-airi/stage-ui/constants/prompts/artistry-instruction'
import { applyAiriCardEditorModules, getAiriCardEditorModuleSettings, safeParseAiriCardDraft } from '@proj-airi/stage-ui/services/airi-card-editor'
import { resolveModuleSelection } from '@proj-airi/stage-ui/services/airi-card-modules'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, FieldInput, FieldValues, GhostButton, IconButton } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { isEqual } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import CardCreationTabArtistry from './tabs/CardCreationTabArtistry.vue'

interface Props {
  cardId?: string
  initialSection?: string
}

interface SavedCardPayload {
  cardId: string
  activated: boolean
}

interface LegacyArtistrySettings {
  provider?: string
  model?: string
  promptPrefix?: string
  widgetInstruction?: string
  spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget'
  autonomousEnabled?: boolean
  autonomousThreshold?: number
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
  'saved': [payload: SavedCardPayload]
  'back': []
  'update:section': [section: string]
}>()
const dirty = defineModel<boolean>('dirty', { default: false })

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
    { value: 'none', label: t('settings.pages.card.creation.none_disabled') },
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
  if (!isInitializingModuleSelections && provider !== previous)
    selectedArtistryModel.value = ''
}, { flush: 'sync' })

// Watch consciousness provider changes and reload models
watch(selectedConsciousnessProvider, async (newProvider, oldProvider) => {
  if (!isInitializingModuleSelections && newProvider !== oldProvider) {
    selectedConsciousnessModel.value = ''
    await consciousnessStore.loadModelsForProvider(newProvider || consciousnessProvider.value)
  }
}, { flush: 'sync' })

// Watch vision provider changes and reload models
watch(selectedVisionProvider, async (newProvider, oldProvider) => {
  if (!isInitializingModuleSelections && newProvider !== oldProvider) {
    selectedVisionModel.value = ''
    await visionStore.loadModelsForProvider(newProvider || visionProvider.value)
  }
}, { flush: 'sync' })

// Watch speech provider changes and reload models/voices
watch(selectedSpeechProvider, async (newProvider, oldProvider) => {
  if (!isInitializingModuleSelections && newProvider !== oldProvider) {
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
  if (!isInitializingModuleSelections && oldModel !== undefined && newModel !== oldModel && provider) {
    selectedSpeechVoiceId.value = ''
  }
}, { flush: 'sync' })

interface EditorSection {
  id: string
  label: string
  icon: string
}

// Module section styling shared by the chat / vision / speech / body groups.
const moduleSectionClasses = [
  'rounded-xl border border-neutral-200/70 dark:border-neutral-800',
  'bg-neutral-50/60 dark:bg-neutral-900/40',
  'p-4',
]
const moduleSectionHeaderClasses = [
  'mb-3 flex items-center gap-2',
  'text-sm font-semibold text-neutral-700 dark:text-neutral-200',
]
const moduleFieldLabelClasses = [
  'text-xs font-medium text-neutral-500 dark:text-neutral-400',
]
const editorTextareaClass = 'min-h-40 md:min-h-[clamp(12rem,30dvh,24rem)]'
const editorLongTextareaClass = 'min-h-48 md:min-h-[clamp(14rem,34dvh,28rem)]'

const activeSectionId = ref('')

const sections = computed<EditorSection[]>(() => [
  { id: 'identity', label: t('settings.pages.card.creation.identity'), icon: 'i-solar:emoji-funny-square-bold-duotone' },
  { id: 'behavior', label: t('settings.pages.card.creation.behavior'), icon: 'i-solar:chat-round-line-bold-duotone' },
  { id: 'modules', label: t('settings.pages.card.modules'), icon: 'i-solar:widget-4-bold-duotone' },
  { id: 'artistry', label: t('settings.pages.modules.artistry.title'), icon: 'i-solar:gallery-bold-duotone' },
  { id: 'settings', label: t('settings.pages.card.creation.settings'), icon: 'i-solar:settings-bold-duotone' },
])

const activeSection = computed({
  get: () => {
    if (sections.value.some(section => section.id === activeSectionId.value))
      return activeSectionId.value
    if (props.initialSection && sections.value.some(section => section.id === props.initialSection))
      return props.initialSection
    return sections.value[0]?.id || ''
  },
  set: (value: string) => {
    activeSectionId.value = value
    emit('update:section', value)
  },
})

watch(() => props.initialSection, (section) => {
  if (section && sections.value.some(item => item.id === section))
    activeSectionId.value = section
}, { immediate: true })

function scrollActiveSectionIntoView(section: string) {
  if (typeof document === 'undefined')
    return

  const mobileSectionButton = document.querySelector<HTMLElement>(`[data-card-editor-section="${section}"]`)
  if (mobileSectionButton?.offsetParent)
    mobileSectionButton.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

let revealTimer = 0

function revealActiveSection(section: string) {
  void nextTick(() => {
    scrollActiveSectionIntoView(section)
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => scrollActiveSectionIntoView(section))
  })
  window.clearTimeout(revealTimer)
  revealTimer = window.setTimeout(scrollActiveSectionIntoView, 150, section)
}

watch(activeSection, async (section) => {
  // 直接打开末尾分区时，移动端导航也必须把当前项滚入视野。
  revealActiveSection(section)
  if (section === 'modules')
    await loadSelectedModuleOptions()
}, { immediate: true, flush: 'post' })

onMounted(() => revealActiveSection(activeSection.value))

onUnmounted(() => window.clearTimeout(revealTimer))

// Preview discovery never commits runtime speech state. Leaving the page or
// changing the selection invalidates the response, including in-flight RPCs.
watch([
  () => activeSection.value === 'modules',
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

const showError = ref<boolean>(false)
const errorMessage = ref<string>('')
const isSaving = ref<boolean>(false)

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

const card = ref<Card>(createCardDraft())
const initialSnapshot = shallowRef<EditorSnapshot>()

interface EditorSnapshot {
  card: Card
  consciousness: {
    provider: string
    model: string
  }
  vision: {
    provider: string
    model: string
  }
  speech: {
    provider: string
    model: string
    voiceId: string
  }
  displayModelId: string
  artistry: {
    provider: string
    model: string
    promptPrefix: string
    widgetInstruction: string
    spawnMode: 'bg' | 'widget' | 'inline' | 'bg_widget'
    autonomousEnabled: boolean
    autonomousThreshold: number
    config: string
  }
}

function createEditorSnapshot(): EditorSnapshot {
  return structuredClone({
    // JSON 序列化会读取每个响应式字段，确保字段变更能触发未保存状态。
    card: JSON.parse(JSON.stringify(card.value)) as Card,
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
      voiceId: selectedSpeechVoiceId.value,
    },
    displayModelId: selectedDisplayModelId.value,
    artistry: {
      provider: selectedArtistryProvider.value,
      model: selectedArtistryModel.value,
      promptPrefix: selectedArtistryPromptPrefix.value,
      widgetInstruction: selectedArtistryWidgetInstruction.value,
      spawnMode: selectedArtistrySpawnMode.value,
      autonomousEnabled: selectedArtistryAutonomousEnabled.value,
      autonomousThreshold: selectedArtistryAutonomousThreshold.value,
      config: selectedArtistryConfigStr.value,
    },
  })
}

const isDirty = computed(() => {
  if (!initialSnapshot.value)
    return false
  return !isEqual(createEditorSnapshot(), initialSnapshot.value)
})

watch(isDirty, (value) => {
  dirty.value = value
}, { immediate: true })

watch(() => props.cardId, async () => {
  showError.value = false
  errorMessage.value = ''
  hasLoadedModuleOptions = false
  isInitializingModuleSelections = true
  card.value = initializeCard()
  await nextTick()
  isInitializingModuleSelections = false
  initialSnapshot.value = createEditorSnapshot()

  if (activeSection.value === 'modules')
    await loadSelectedModuleOptions()
}, { immediate: true })

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
function getDefaultPlaceholder(): string {
  return t('settings.pages.card.creation.inherit_global_settings')
}

const cardNotFound = computed(() => isEditMode.value && !!props.cardId && !cardStore.getCard(props.cardId))
const editorTitle = computed(() => {
  if (!isEditMode.value)
    return t('settings.pages.card.create_card')
  return card.value.name || t('settings.pages.card.edit_card')
})

async function handleSave(activate: boolean) {
  if (isSaving.value)
    return

  isSaving.value = true
  try {
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
        return
      }
    }

    const draftResult = safeParseAiriCardDraft(toRaw(card.value), selectedArtistryConfigStr.value)
    if (!draftResult.success) {
      showError.value = true
      errorMessage.value = t(`settings.pages.card.creation.errors.${draftResult.error}`)
      return
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
      if (!await cardStore.updateCard(props.cardId, cardWithModules)) {
        showError.value = true
        errorMessage.value = t('settings.pages.card.card_not_found')
        return
      }
      savedCardId = props.cardId
      trackCardEdited({ card_id: props.cardId })
    }
    else {
      savedCardId = await cardStore.addCard(cardWithModules, 'scratch')
    }

    if (activate)
      await cardStore.activateCard(savedCardId)

    initialSnapshot.value = createEditorSnapshot()
    toast(t('settings.pages.card.saved'))
    if (activate) {
      toast(t('settings.pages.card.activation_notice', {
        name: cardWithModules.name || editorTitle.value,
      }))
    }
    emit('saved', { cardId: savedCardId, activated: activate })
  }
  finally {
    isSaving.value = false
  }
}

function handleBack() {
  emit('back')
}
</script>

<template>
  <div :class="['h-full min-h-0 w-full', 'flex flex-col', 'bg-white dark:bg-neutral-950']">
    <header
      :class="[
        'shrink-0',
        'border-b border-neutral-200/70 dark:border-neutral-800',
        'bg-white/95 backdrop-blur-md dark:bg-neutral-950/95',
      ]"
    >
      <div :class="['mx-auto w-full max-w-7xl', 'flex items-center justify-between gap-3', 'px-4 py-3 lg:px-6']">
        <div :class="['min-w-0', 'flex items-center gap-3']">
          <IconButton
            icon="i-solar:alt-arrow-left-line-duotone"
            :aria-label="t('settings.pages.card.back')"
            @click="handleBack"
          />
          <div
            :class="[
              'size-10 shrink-0',
              'flex items-center justify-center',
              'rounded-xl bg-primary-500/10',
              'text-xl text-primary-500 dark:text-primary-400',
            ]"
          >
            <div :class="isEditMode ? 'i-solar:pen-new-square-bold-duotone' : 'i-solar:add-square-bold-duotone'" />
          </div>
          <div :class="['min-w-0']">
            <div :class="['flex items-center gap-2']">
              <h1 :class="['truncate', 'text-lg font-semibold', 'text-neutral-900 dark:text-neutral-100']">
                {{ editorTitle }}
              </h1>
              <span
                v-if="isDirty"
                :class="[
                  'shrink-0 rounded-full px-2 py-0.5',
                  'bg-amber-500/15 text-xs text-amber-700 font-medium',
                  'dark:text-amber-300',
                ]"
              >
                {{ t('settings.pages.card.unsaved.badge') }}
              </span>
            </div>
            <p v-if="isEditMode" :class="['mt-0.5 text-xs text-neutral-500 dark:text-neutral-400']">
              v{{ cardVersion }}
            </p>
          </div>
        </div>

        <div :class="['hidden shrink-0 items-center gap-2 md:flex']">
          <Button
            icon="i-solar:check-circle-bold-duotone"
            :label="t('settings.pages.card.save')"
            color="primary"
            variant="secondary"
            :disabled="isSaving || cardNotFound"
            @click="handleSave(false)"
          />
          <Button
            v-if="!isEditingActiveCard"
            icon="i-solar:play-circle-bold-duotone"
            :label="t('settings.pages.card.save_and_activate')"
            color="primary"
            variant="primary"
            :disabled="isSaving || cardNotFound"
            @click="handleSave(true)"
          />
        </div>
      </div>
    </header>

    <div
      v-if="cardNotFound"
      :class="[
        'm-4 flex flex-1 flex-col items-center justify-center gap-4',
        'border border-neutral-200 rounded-xl',
        'bg-neutral-50/50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900/50',
      ]"
    >
      <div :class="['i-solar:card-search-broken', 'text-6xl text-neutral-400']" />
      <p :class="['text-neutral-600 dark:text-neutral-300']">
        {{ t('settings.pages.card.card_not_found') }}
      </p>
      <Button
        icon="i-solar:alt-arrow-left-line-duotone"
        :label="t('settings.pages.card.back')"
        @click="handleBack"
      />
    </div>

    <div
      v-else
      :class="[
        'min-h-0 flex-1',
        'flex flex-col',
        'lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]',
      ]"
    >
      <aside
        :class="[
          'hidden lg:block',
          'border-r border-neutral-200/70 dark:border-neutral-800',
          'p-3',
        ]"
      >
        <nav :class="['sticky top-0 flex flex-col gap-1']">
          <GhostButton
            v-for="section in sections"
            :key="section.id"
            :icon="section.icon"
            :label="section.label"
            :active="activeSection === section.id"
            block
            :class="[
              'justify-start',
              activeSection === section.id ? '!bg-primary-500/15 dark:!bg-primary-400/15' : '',
            ]"
            @click="activeSection = section.id"
          />
        </nav>
      </aside>

      <section :class="['min-h-0 flex flex-1 flex-col']">
        <div :class="['border-b border-neutral-200/70 px-4 py-3 dark:border-neutral-800 lg:hidden']">
          <div
            :class="[
              'relative',
              'flex gap-1 overflow-x-auto pb-1',
              'after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8',
              'after:bg-gradient-to-l after:from-white after:to-transparent',
              'dark:after:from-neutral-950',
            ]"
          >
            <GhostButton
              v-for="section in sections"
              :key="section.id"
              :data-card-editor-section="section.id"
              :icon="section.icon"
              :label="section.label"
              :active="activeSection === section.id"
              size="sm"
              :class="[
                'shrink-0',
                activeSection === section.id ? '!bg-primary-500/15 dark:!bg-primary-400/15' : '',
              ]"
              @click="activeSection = section.id"
            />
          </div>
        </div>

        <div :class="['min-h-0 flex-1 overflow-y-auto']">
          <div :class="['mx-auto w-full max-w-6xl', 'px-4 py-5 lg:px-8 lg:py-8']">
            <!-- Error banner -->
            <div
              v-if="showError"
              :class="[
                'mb-5 flex items-center gap-3',
                'rounded-xl border border-red-500/30 bg-red-500/10',
                'px-4 py-3 text-sm',
                'text-red-600 dark:text-red-400',
              ]"
            >
              <div class="i-solar:danger-triangle-bold-duotone shrink-0 text-lg" />
              <p>{{ errorMessage }}</p>
            </div>

            <!-- Identity details -->
            <div v-if="activeSection === 'identity'" :class="['flex flex-col gap-6']">
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.card.creation.fields_info.subtitle') }}
              </p>

              <div :class="['grid grid-cols-1 gap-5', 'sm:grid-cols-2']">
                <FieldInput v-model="cardName" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
                <FieldInput v-model="cardNickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
              </div>

              <div :class="['grid grid-cols-1 gap-5', 'xl:grid-cols-2']">
                <FieldInput v-model="cardDescription" :label="t('settings.pages.card.creation.description')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.description')" :input-class="editorTextareaClass" />
                <FieldInput v-model="cardNotes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" :input-class="editorTextareaClass" />
              </div>
            </div>
            <!-- Behavior -->
            <div v-else-if="activeSection === 'behavior'" :class="['flex flex-col gap-5']">
              <div :class="['grid grid-cols-1 gap-5', 'xl:grid-cols-2']">
                <FieldInput v-model="cardPersonality" :label="t('settings.pages.card.personality')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.personality')" :input-class="editorLongTextareaClass" />
                <FieldInput v-model="cardScenario" :label="t('settings.pages.card.scenario')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.scenario')" :input-class="editorLongTextareaClass" />
              </div>
              <FieldValues v-model="cardGreetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" :required="false" />
            </div>
            <!-- Modules -->
            <div v-else-if="activeSection === 'modules'" :class="['flex flex-col gap-5']">
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.card.creation.modules_info') }}
              </p>

              <!-- Chat -->
              <section :class="moduleSectionClasses">
                <div :class="moduleSectionHeaderClasses">
                  <div i-lucide:brain :class="['text-base text-primary-500 dark:text-primary-400']" />
                  {{ t('settings.pages.card.creation.sections.chat') }}
                </div>
                <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.chat.provider') }}
                    </label>
                    <ComboboxSelect
                      v-model="consciousnessProviderSelection"
                      :options="consciousnessProviderOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.consciousness.model') }}
                    </label>
                    <ComboboxSelect
                      v-model="consciousnessModelSelection"
                      :options="consciousnessModelOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                </div>
              </section>

              <!-- Vision -->
              <section :class="moduleSectionClasses">
                <div :class="moduleSectionHeaderClasses">
                  <div i-lucide:eye :class="['text-base text-primary-500 dark:text-primary-400']" />
                  {{ t('settings.pages.card.creation.sections.vision') }}
                </div>
                <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.vision.provider') }}
                    </label>
                    <ComboboxSelect
                      v-model="visionProviderSelection"
                      :options="visionProviderOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.vision.model') }}
                    </label>
                    <ComboboxSelect
                      v-model="visionModelSelection"
                      :options="visionModelOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                </div>
              </section>

              <!-- Speech -->
              <section :class="moduleSectionClasses">
                <div :class="moduleSectionHeaderClasses">
                  <div i-lucide:mic :class="['text-base text-primary-500 dark:text-primary-400']" />
                  {{ t('settings.pages.card.creation.sections.speech') }}
                </div>
                <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.speech.provider') }}
                    </label>
                    <ComboboxSelect
                      v-model="speechProviderSelection"
                      :options="speechProviderOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                  <div :class="['flex flex-col gap-1.5']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.speech.model') }}
                    </label>
                    <ComboboxSelect
                      v-model="speechModelSelection"
                      :options="speechModelOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                  <div :class="['flex flex-col gap-1.5', 'sm:col-span-2']">
                    <label :class="moduleFieldLabelClasses">
                      {{ t('settings.pages.card.speech.voice') }}
                    </label>
                    <ComboboxSelect
                      v-model="speechVoiceSelection"
                      :options="speechVoiceOptions"
                      :placeholder="getDefaultPlaceholder()"
                      class="w-full"
                    />
                  </div>
                </div>
              </section>

              <!-- Body -->
              <section :class="moduleSectionClasses">
                <div :class="moduleSectionHeaderClasses">
                  <div i-solar:ghost-bold-duotone :class="['text-base text-primary-500 dark:text-primary-400']" />
                  {{ t('settings.pages.card.creation.sections.body') }}
                </div>
                <div :class="['flex flex-col gap-1.5']">
                  <label :class="moduleFieldLabelClasses">
                    {{ t('settings.pages.card.body-model') }}
                  </label>
                  <ComboboxSelect
                    v-model="displayModelSelection"
                    :options="displayModelOptions"
                    :placeholder="getDefaultPlaceholder()"
                    class="w-full"
                  />
                </div>
              </section>
            </div>
            <!-- Settings -->
            <div v-else-if="activeSection === 'settings'" :class="['flex flex-col gap-5']">
              <div :class="['grid grid-cols-1 gap-5', 'xl:grid-cols-2']">
                <FieldInput v-model="cardSystemPrompt" :label="t('settings.pages.card.systemprompt')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.systemprompt')" :input-class="editorLongTextareaClass" />
                <FieldInput v-model="cardPostHistoryInstructions" :label="t('settings.pages.card.posthistoryinstructions')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')" :input-class="editorLongTextareaClass" />
              </div>
              <div :class="['grid grid-cols-1 gap-5', 'sm:grid-cols-2']">
                <FieldInput v-model="cardVersion" :label="t('settings.pages.card.creation.version')" :required="true" :description="t('settings.pages.card.creation.fields_info.version')" />
              </div>
            </div>
            <!-- Artistry -->
            <CardCreationTabArtistry
              v-else-if="activeSection === 'artistry'"
              v-model:selected-artistry-provider="artistryProviderSelection"
              v-model:selected-artistry-model="selectedArtistryModel"
              v-model:selected-artistry-prompt-prefix="selectedArtistryPromptPrefix"
              v-model:selected-artistry-widget-instruction="selectedArtistryWidgetInstruction"
              v-model:selected-artistry-autonomous-enabled="selectedArtistryAutonomousEnabled"
              v-model:selected-artistry-autonomous-threshold="selectedArtistryAutonomousThreshold"
              v-model:selected-artistry-spawn-mode="selectedArtistrySpawnMode"
              v-model:selected-artistry-config-str="selectedArtistryConfigStr"
              :artistry-provider-options="artistryProviderOptions"
              :default-artistry-provider-placeholder="getDefaultPlaceholder()"
            />
          </div>
        </div>

        <footer
          :class="[
            'shrink-0',
            'border-t border-neutral-200/70 dark:border-neutral-800',
            'bg-white/95 px-4 py-3 backdrop-blur-md dark:bg-neutral-950/95',
            'md:hidden',
          ]"
        >
          <div :class="['flex items-center justify-end gap-2']">
            <Button
              icon="i-solar:check-circle-bold-duotone"
              :label="t('settings.pages.card.save')"
              color="primary"
              variant="secondary"
              :disabled="isSaving"
              @click="handleSave(false)"
            />
            <Button
              v-if="!isEditingActiveCard"
              icon="i-solar:play-circle-bold-duotone"
              :label="t('settings.pages.card.save_and_activate')"
              color="primary"
              variant="primary"
              :disabled="isSaving"
              @click="handleSave(true)"
            />
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>
