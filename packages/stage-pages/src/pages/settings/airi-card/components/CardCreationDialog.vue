<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'
import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'
import type { SpeechCapabilitiesInfo } from '@proj-airi/stage-ui/stores/providers'

import kebabcase from '@stdlib/string-base-kebabcase'

import { useModelStore } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '@proj-airi/stage-ui/constants/prompts/artistry-instruction'
import { DisplayModelFormat, useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProactivityStore } from '@proj-airi/stage-ui/stores/proactivity'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSceneStore } from '@proj-airi/stage-ui/stores/scene'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CardCreationTabActing from './tabs/CardCreationTabActing.vue'
import CardCreationTabArtistry from './tabs/CardCreationTabArtistry.vue'
import CardCreationTabBehavior from './tabs/CardCreationTabBehavior.vue'
import CardCreationTabIdentity from './tabs/CardCreationTabIdentity.vue'
import CardCreationTabModules from './tabs/CardCreationTabModules.vue'
import CardCreationTabProactivity from './tabs/CardCreationTabProactivity.vue'

interface Props {
  modelValue: boolean
  cardId?: string // If provided, edit mode; otherwise create mode
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const modelValue = defineModel<boolean>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const consciousnessStore = useConsciousnessStore()
const speechStore = useSpeechStore()
const artistryStore = useArtistryStore()
const proactivityStore = useProactivityStore()
const providersStore = useProvidersStore()
const displayModelsStore = useDisplayModelsStore()
const stageModelStore = useSettingsStageModel()
const modelStore = useModelStore()

const { sensorPayload } = storeToRefs(proactivityStore)
const { activeProvider: consciousnessProvider, activeModel: defaultConsciousnessModel } = storeToRefs(consciousnessStore)
const { activeSpeechProvider: speechProvider, activeSpeechModel: defaultSpeechModel, activeSpeechVoiceId: defaultSpeechVoiceId } = storeToRefs(speechStore)
const { stageModelSelected: defaultDisplayModelId } = storeToRefs(stageModelStore)
const { activeProvider: defaultArtistryProvider } = storeToRefs(artistryStore)
const { availableExpressions } = storeToRefs(modelStore)
const sceneStore = useSceneStore()
const { backgrounds } = storeToRefs(sceneStore)
const { activeCardId } = storeToRefs(cardStore)

// Determine if we're in edit mode
const isEditMode = computed(() => !!props.cardId)

// Modules configuration
const selectedConsciousnessProvider = ref<string>('')
const selectedConsciousnessModel = ref<string>('')
const selectedSpeechProvider = ref<string>('')
const selectedSpeechModel = ref<string>('')
const selectedSpeechVoiceId = ref<string>('')
const selectedDisplayModelId = ref<string>('')
const selectedPreferredBackgroundId = ref<string>('__none__')
const selectedArtistryProvider = ref<string>('')
const selectedArtistryModel = ref<string>('')
const selectedArtistryPromptPrefix = ref<string>('')
const selectedArtistryWidgetInstruction = ref<string>('')
const selectedArtistryConfigStr = ref<string>('{\n  \n}')
const selectedActingModelExpressionPrompt = ref<string>('')
const selectedActingSpeechExpressionPrompt = ref<string>('')
const selectedActingSpeechMannerismPrompt = ref<string>('')
const actingSpeechCapabilities = ref<SpeechCapabilitiesInfo | null>(null)
const actingSpeechCapabilitiesLoading = ref<boolean>(false)

const DEFAULT_ACTING_MODEL_PROMPT = `## Instruction: ACT Tokens
Start every reply with an ACT token to indicate your initial mood or action. If your synchronization or focus changes, insert a new ACT token. One token lasts until you use a new one.

**ACT JSON format (all fields optional):**
\`<|ACT:"emotion":{"name": expression_name, "intensity": 1}|>\`

## Available Expressions (Keys)
Use these EXACT names in your ACT tokens:
`

const DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT = `## Instruction: Speech Tags
When the active voice provider supports expressive speech tags, you may use them inline to shape delivery.

Use square-bracket tags like \`[whisper]\` or \`[gasp]\` only when they improve the line.
- Keep them sparse and readable.
- Prefer one strong tag over many weak ones.
- Match the tag to the emotional beat of the sentence.
`

const DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT = `## Instruction: Speech Mannerisms
Use provider-supported speech mannerisms only when they help communicate tone or attitude.

- Keep them occasional and intentional.
- Use them to reinforce personality, not every line.
- Favor clarity first, style second.
`

const MANNERISM_HELPER_SNIPPETS: Record<string, string> = {
  tilde: `## Tilde Replacements
Use occasional \`~\` when sounding playful, sing-song, teasing, or gently affectionate.
- Keep it light and sparse.
- Avoid using it on every sentence.
- Prefer it when the line should feel airy or mischievous.
`,
  eyes: `## Emoticon Replacements
Use short emoticon-style reactions when a strong expression would land better as a quick face than as plain words.
- Keep them readable and emotionally obvious.
- Use them for spikes of embarrassment, excitement, confusion, or stress.
- Do not overuse them in serious or dense exposition.
`,
  hmph: `## Hmph Variants
Use brief pouty or dismissive mannerisms when sounding stubborn, embarrassed, bratty, or mildly annoyed.
- Keep them occasional.
- Let them color the line instead of replacing the content.
- Use them when attitude matters more than pure politeness.
`,
}

// Heartbeats configuration
const heartbeatsEnabled = ref<boolean>(false)
const heartbeatsIntervalMinutes = ref<number>(30)
const heartbeatsPrompt = ref<string>('')
const heartbeatsInjectIntoPrompt = ref<boolean>(true)
const heartbeatsUseAsLocalGate = ref<boolean>(true)
const heartbeatsScheduleStart = ref<string>('09:00')
const heartbeatsScheduleEnd = ref<string>('22:00')
const heartbeatsContextWindowHistory = ref<boolean>(true)
const heartbeatsContextSystemLoad = ref<boolean>(true)
const heartbeatsContextUsageMetrics = ref<boolean>(true)

const staticSamplePayload = `[Sensor Data]
User Idle: 15s
[ VS Code ] [ 15m ] [ 10:45 - 11:00 ]
[ Spotify ] [ 3m ] [ 11:00 - 11:03 ]
CPU Load (1/5/15): 0.5 | 0.72 | 0.61
GPU Load (Avg): 0.45
Volume Level: 85%
Current Local Time: 14:30

[Usage Metrics (Last Hr)]
TTS (Last Hr): 5
STT (Last Hr): 0
Chat (Last Hr): 2
Turn Count: 498 (Next Target: 500)`

const consciousnessProviderOptions = computed(() => {
  return providersStore.configuredChatProvidersMetadata.map(provider => ({
    value: provider.id,
    label: provider.localizedName || provider.name,
  }))
})

const artistryProviderOptions = computed(() => {
  return [
    { value: 'replicate', label: 'Replicate' },
    { value: 'comfyui', label: 'ComfyUI' },
  ]
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

const displayModelOptions = computed(() => {
  return displayModelsStore.displayModels.map((model) => {
    const isLive2D = model.format === DisplayModelFormat.Live2dZip || model.format === DisplayModelFormat.Live2dDirectory
    const prefix = isLive2D ? '[Live2D]' : '[VRM]'
    return {
      value: model.id,
      label: `${prefix} ${model.name}`,
    }
  })
})

const sceneOptions = computed(() => {
  const options = Array.from(backgrounds.value.entries()).map(([id, bg]) => ({
    value: id,
    label: bg.name || id,
  }))

  return [
    { value: '__default__', label: t('settings.pages.card.creation.use_default') },
    { value: '__none__', label: t('settings.pages.card.creation.none') },
    ...options,
  ]
})

const selectedPreferredBackgroundName = computed(() => {
  if (selectedPreferredBackgroundId.value === '__none__')
    return 'none'

  if (selectedPreferredBackgroundId.value === '__default__')
    return null

  return backgrounds.value.get(selectedPreferredBackgroundId.value)?.name ?? null
})

const selectedPreferredBackgroundDataUrl = computed(() => {
  if (selectedPreferredBackgroundId.value === '__default__' || selectedPreferredBackgroundId.value === '__none__')
    return null

  return backgrounds.value.get(selectedPreferredBackgroundId.value)?.url ?? null
})

const actingModelExpressionOptions = computed(() => {
  const modelExps = [...availableExpressions.value]
  const vrmaExps = Object.keys(animations)
  return [...new Set([...modelExps, ...vrmaExps])].sort((a, b) => a.localeCompare(b))
})

function isVrmaExpression(name: string) {
  return name in animations
}

const actingExpressionTags = computed(() => actingSpeechCapabilities.value?.expressionTags || [])

const actingGroupedExpressionTags = computed(() => {
  const groups = new Map<string, { tag: string, description?: string }[]>()
  for (const tag of actingExpressionTags.value) {
    const key = tag.category || 'other'
    if (!groups.has(key))
      groups.set(key, [])
    groups.get(key)!.push({ tag: tag.tag, description: tag.description })
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, tags]) => ({
      category,
      tags: tags.sort((a, b) => a.tag.localeCompare(b.tag)),
    }))
})

const actingMannerismOptions = computed(() => actingSpeechCapabilities.value?.mannerisms || [])

async function loadActingSpeechCapabilities(providerId: string) {
  actingSpeechCapabilitiesLoading.value = true
  try {
    const metadata = providersStore.getProviderMetadata(providerId)
    const capabilities = await metadata.capabilities.getSpeechCapabilities?.(providersStore.getProviderConfig(providerId))
    actingSpeechCapabilities.value = capabilities ?? null
  }
  catch {
    actingSpeechCapabilities.value = null
  }
  finally {
    actingSpeechCapabilitiesLoading.value = false
  }
}

function appendUniqueLine(target: typeof selectedActingModelExpressionPrompt, line: string) {
  if (target.value.includes(line))
    return

  const suffix = target.value.endsWith('\n') || !target.value ? '' : '\n'
  target.value = `${target.value}${suffix}${line}\n`
}

function insertModelExpression(name: string) {
  appendUniqueLine(selectedActingModelExpressionPrompt, `- \`${name}\``)
}

function insertSpeechTag(tag: string, description?: string) {
  const line = description
    ? `- \`[${tag}]\` - ${description}`
    : `- \`[${tag}]\``
  appendUniqueLine(selectedActingSpeechExpressionPrompt, line)
}

function insertSpeechMannerism(id: string) {
  const snippet = MANNERISM_HELPER_SNIPPETS[id]
  if (!snippet || selectedActingSpeechMannerismPrompt.value.includes(snippet.trim()))
    return

  const suffix = selectedActingSpeechMannerismPrompt.value.endsWith('\n') || !selectedActingSpeechMannerismPrompt.value ? '' : '\n\n'
  selectedActingSpeechMannerismPrompt.value = `${selectedActingSpeechMannerismPrompt.value}${suffix}${snippet}`
}

onMounted(() => {
  displayModelsStore.loadDisplayModelsFromIndexedDB()
})

// Load models for current providers on init
watch(() => [consciousnessProvider.value, speechProvider.value], async ([consProvider, spProvider]) => {
  if (consProvider) {
    await consciousnessStore.loadModelsForProvider(consProvider)
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
    await consciousnessStore.loadModelsForProvider(newProvider)
    // Reset model selection to default or empty
    selectedConsciousnessModel.value = ''
  }
})

// Watch speech provider changes and reload models/voices
watch(selectedSpeechProvider, async (newProvider, oldProvider) => {
  if (oldProvider !== undefined && newProvider !== oldProvider && newProvider) {
    await speechStore.loadVoicesForProvider(newProvider)
    const metadata = providersStore.getProviderMetadata(newProvider)
    if (metadata?.capabilities.listModels) {
      await providersStore.fetchModelsForProvider(newProvider)
    }
    await loadActingSpeechCapabilities(newProvider)
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
  { id: 'acting', label: 'Acting', icon: 'i-solar:mask-happly-bold-duotone' },
  { id: 'modules', label: t('settings.pages.card.modules'), icon: 'i-solar:widget-4-bold-duotone' },
  { id: 'artistry', label: t('settings.pages.modules.artistry.title'), icon: 'i-solar:gallery-bold-duotone' },
  { id: 'proactivity', label: t('settings.pages.card.creation.proactivity', 'Proactivity'), icon: 'i-solar:heart-pulse-bold-duotone' },
]

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.find(tab => tab.id === activeTabId.value))
      return tabs[0]?.id || ''
    return activeTabId.value
  },
  set: (value: string) => {
    activeTabId.value = value
  },
})

// Check for errors, and save built Cards :

const showError = ref<boolean>(false)
const errorMessage = ref<string>('')

function saveCard(card: Card): boolean {
  // Before saving, let's validate what the user entered :
  const rawCard: Card = toRaw(card)

  if (!((rawCard.name?.length ?? 0) > 0)) {
    // No name
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.name')
    return false
  }
  else if (!/^(?:\d+\.)+\d+$/.test(rawCard.version)) {
    // Invalid version
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.version')
    return false
  }
  else if (!((rawCard.description?.length ?? 0) > 0)) {
    // No description
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.description')
    return false
  }
  else if (!((rawCard.personality?.length ?? 0) > 0)) {
    // No personality
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.personality')
    return false
  }
  else if (!((rawCard.scenario?.length ?? 0) > 0)) {
    // No Scenario
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.scenario')
    return false
  }
  else if (!((rawCard.systemPrompt?.length ?? 0) > 0)) {
    // No sys prompt
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.systemprompt')
    return false
  }
  else if (!((rawCard.postHistoryInstructions?.length ?? 0) > 0)) {
    // No post history prompt
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.posthistoryinstructions')
    return false
  }
  showError.value = false

  // Build card with modules extension
  const cardWithModules = {
    ...rawCard,
    extensions: {
      ...rawCard.extensions,
      airi: {
        modules: {
          consciousness: {
            provider: selectedConsciousnessProvider.value || consciousnessProvider.value,
            model: selectedConsciousnessModel.value || defaultConsciousnessModel.value,
          },
          speech: {
            provider: selectedSpeechProvider.value || speechProvider.value,
            model: selectedSpeechModel.value || defaultSpeechModel.value,
            voice_id: selectedSpeechVoiceId.value || defaultSpeechVoiceId.value,
          },
          displayModelId: selectedDisplayModelId.value || defaultDisplayModelId.value,
          preferredBackgroundId: selectedPreferredBackgroundId.value === '__default__'
            ? null
            : (selectedPreferredBackgroundId.value === '__none__' ? 'none' : selectedPreferredBackgroundId.value),
          preferredBackgroundName: selectedPreferredBackgroundName.value,
          preferredBackgroundDataUrl: selectedPreferredBackgroundDataUrl.value,
        },
        agents: {},
        heartbeats: {
          enabled: heartbeatsEnabled.value,
          intervalMinutes: heartbeatsIntervalMinutes.value,
          prompt: heartbeatsPrompt.value,
          injectIntoPrompt: heartbeatsInjectIntoPrompt.value,
          useAsLocalGate: heartbeatsUseAsLocalGate.value,
          contextOptions: {
            windowHistory: heartbeatsContextWindowHistory.value,
            systemLoad: heartbeatsContextSystemLoad.value,
            usageMetrics: heartbeatsContextUsageMetrics.value,
          },
          schedule: {
            start: heartbeatsScheduleStart.value,
            end: heartbeatsScheduleEnd.value,
          },
        },
        acting: {
          modelExpressionPrompt: selectedActingModelExpressionPrompt.value,
          speechExpressionPrompt: selectedActingSpeechExpressionPrompt.value,
          speechMannerismPrompt: selectedActingSpeechMannerismPrompt.value,
        },
      } as AiriExtension,
    },
  }

  // Inject artistry manually to avoid TS errors
  cardWithModules.extensions.airi.artistry = {
    provider: selectedArtistryProvider.value || defaultArtistryProvider.value,
    model: selectedArtistryModel.value,
    promptPrefix: selectedArtistryPromptPrefix.value,
    widgetInstruction: selectedArtistryWidgetInstruction.value,
    options: (() => {
      try {
        return selectedArtistryConfigStr.value.trim() ? JSON.parse(selectedArtistryConfigStr.value) : undefined
      }
      catch {
        return undefined
      }
    })(),
  }

  if (isEditMode.value && props.cardId) {
    // Edit mode: update existing card
    cardStore.updateCard(props.cardId, cardWithModules)
  }
  else {
    // Create mode: add new card
    cardStore.addCard(cardWithModules)
  }

  modelValue.value = false // Close this
  return true
}

// Cards data holders :

// Initialize card data - load from existing card if in edit mode
function initializeCard(): Card {
  // Extract existing card data if in edit mode
  const existingCard = (isEditMode.value && props.cardId) ? cardStore.getCard(props.cardId) : undefined
  const airiExt = existingCard?.extensions?.airi as AiriExtension | undefined

  // Initialize module selections with fallback logic (handles all cases: create, edit with/without extension)
  selectedConsciousnessProvider.value = airiExt?.modules?.consciousness?.provider || consciousnessProvider.value
  selectedConsciousnessModel.value = airiExt?.modules?.consciousness?.model || defaultConsciousnessModel.value
  selectedSpeechProvider.value = airiExt?.modules?.speech?.provider || speechProvider.value
  selectedSpeechModel.value = airiExt?.modules?.speech?.model || defaultSpeechModel.value
  selectedSpeechVoiceId.value = airiExt?.modules?.speech?.voice_id || defaultSpeechVoiceId.value
  selectedDisplayModelId.value = airiExt?.modules?.displayModelId || defaultDisplayModelId.value
  const preferredBg = airiExt?.modules?.preferredBackgroundId
  selectedPreferredBackgroundId.value = preferredBg === 'none'
    ? '__none__'
    : (preferredBg ?? '__none__')
  selectedArtistryProvider.value = airiExt?.artistry?.provider || defaultArtistryProvider.value
  selectedArtistryModel.value = airiExt?.artistry?.model || ''
  selectedArtistryPromptPrefix.value = airiExt?.artistry?.promptPrefix || ''
  selectedArtistryWidgetInstruction.value = airiExt?.artistry?.widgetInstruction || DEFAULT_ARTISTRY_WIDGET_INSTRUCTION
  selectedActingModelExpressionPrompt.value = airiExt?.acting?.modelExpressionPrompt || DEFAULT_ACTING_MODEL_PROMPT
  selectedActingSpeechExpressionPrompt.value = airiExt?.acting?.speechExpressionPrompt || DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT
  selectedActingSpeechMannerismPrompt.value = airiExt?.acting?.speechMannerismPrompt || DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT
  try {
    selectedArtistryConfigStr.value = airiExt?.artistry?.options ? JSON.stringify(airiExt.artistry.options, null, 2) : '{\n  \n}'
  }
  catch {
    selectedArtistryConfigStr.value = '{\n  \n}'
  }

  heartbeatsEnabled.value = airiExt?.heartbeats?.enabled ?? false
  heartbeatsIntervalMinutes.value = airiExt?.heartbeats?.intervalMinutes ?? 30
  heartbeatsPrompt.value = airiExt?.heartbeats?.prompt ?? ''
  heartbeatsInjectIntoPrompt.value = airiExt?.heartbeats?.injectIntoPrompt ?? true
  heartbeatsUseAsLocalGate.value = airiExt?.heartbeats?.useAsLocalGate ?? true
  heartbeatsScheduleStart.value = airiExt?.heartbeats?.schedule?.start ?? '09:00'
  heartbeatsScheduleEnd.value = airiExt?.heartbeats?.schedule?.end ?? '22:00'
  heartbeatsContextWindowHistory.value = airiExt?.heartbeats?.contextOptions?.windowHistory ?? true
  heartbeatsContextSystemLoad.value = airiExt?.heartbeats?.contextOptions?.systemLoad ?? true
  heartbeatsContextUsageMetrics.value = airiExt?.heartbeats?.contextOptions?.usageMetrics ?? true

  loadActingSpeechCapabilities(selectedSpeechProvider.value || speechProvider.value)

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

const card = ref<Card>(initializeCard())
const hasInitializedPreferredBackground = ref(false)

watch(selectedPreferredBackgroundId, (nextValue) => {
  if (!hasInitializedPreferredBackground.value) {
    hasInitializedPreferredBackground.value = true
    return
  }

  if (!isEditMode.value || !props.cardId || activeCardId.value !== props.cardId)
    return

  if (nextValue === '__none__') {
    sceneStore.setActiveBackground(null)
    return
  }

  if (nextValue === '__default__') {
    sceneStore.setActiveBackground(sceneStore.globalBackgroundId)
    return
  }

  sceneStore.setActiveBackground(nextValue)
})

// Reinitialize when cardId changes or dialog opens
watch(() => [props.modelValue, props.cardId], () => {
  if (props.modelValue) {
    hasInitializedPreferredBackground.value = false
    card.value = initializeCard()
  }
})

function makeComputed<T extends keyof Card>(
  /*
  Function used to generate Computed values, with an optional sanitize function
  */
  key: T,
  transform?: (input: string) => string,
) {
  return computed({
    get: () => {
      return card.value[key] ?? ''
    },
    set: (val: string) => { // Set,
      const input = val.trim() // We first trim the value
      card.value[key] = (input.length > 0
        ? (transform ? transform(input) : input) // then potentially transform it
        : '') as Card[T]// or default to empty string value if nothing was given
    },
  })
}

const cardName = makeComputed('name', input => kebabcase(input))
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
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6">
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

          <!-- Actual content -->
          <CardCreationTabIdentity
            v-if="activeTab === 'identity'"
            v-model:card-name="cardName"
            v-model:card-nickname="cardNickname"
            v-model:card-description="cardDescription"
            v-model:card-notes="cardNotes"
            v-model:card-system-prompt="cardSystemPrompt"
            v-model:card-post-history-instructions="cardPostHistoryInstructions"
            v-model:card-version="cardVersion"
          />
          <CardCreationTabBehavior
            v-else-if="activeTab === 'behavior'"
            v-model:card-personality="cardPersonality"
            v-model:card-scenario="cardScenario"
            v-model:card-greetings="cardGreetings"
          />
          <CardCreationTabActing
            v-else-if="activeTab === 'acting'"
            v-model:selected-acting-model-expression-prompt="selectedActingModelExpressionPrompt"
            v-model:selected-acting-speech-expression-prompt="selectedActingSpeechExpressionPrompt"
            v-model:selected-acting-speech-mannerism-prompt="selectedActingSpeechMannerismPrompt"
            :acting-model-expression-options="actingModelExpressionOptions"
            :acting-grouped-expression-tags="actingGroupedExpressionTags"
            :acting-mannerism-options="actingMannerismOptions"
            :acting-speech-capabilities-loading="actingSpeechCapabilitiesLoading"
            :selected-speech-provider-label="selectedSpeechProvider || speechProvider || 'none'"
            :is-vrma-expression="isVrmaExpression"
            :insert-model-expression="insertModelExpression"
            :insert-speech-tag="insertSpeechTag"
            :insert-speech-mannerism="insertSpeechMannerism"
          />
          <CardCreationTabModules
            v-else-if="activeTab === 'modules'"
            v-model:selected-consciousness-provider="selectedConsciousnessProvider"
            v-model:selected-consciousness-model="selectedConsciousnessModel"
            v-model:selected-speech-provider="selectedSpeechProvider"
            v-model:selected-speech-model="selectedSpeechModel"
            v-model:selected-speech-voice-id="selectedSpeechVoiceId"
            v-model:selected-display-model-id="selectedDisplayModelId"
            v-model:selected-preferred-background-id="selectedPreferredBackgroundId"
            :consciousness-provider-options="consciousnessProviderOptions"
            :consciousness-model-options="consciousnessModelOptions"
            :speech-provider-options="speechProviderOptions"
            :speech-model-options="speechModelOptions"
            :speech-voice-options="speechVoiceOptions"
            :display-model-options="displayModelOptions"
            :scene-options="sceneOptions"
            :consciousness-provider-placeholder="getDefaultPlaceholder(consciousnessProvider)"
            :default-consciousness-model-placeholder="getDefaultPlaceholder(defaultConsciousnessModel)"
            :speech-provider-placeholder="getDefaultPlaceholder(speechProvider)"
            :default-speech-model-placeholder="getDefaultPlaceholder(defaultSpeechModel)"
            :default-speech-voice-id-placeholder="getDefaultPlaceholder(defaultSpeechVoiceId)"
            :default-display-model-id-placeholder="getDefaultPlaceholder(defaultDisplayModelId)"
            :consciousness-provider-active="Boolean(consciousnessProvider)"
            :speech-provider-active="Boolean(speechProvider)"
          />
          <CardCreationTabArtistry
            v-else-if="activeTab === 'artistry'"
            v-model:selected-artistry-provider="selectedArtistryProvider"
            v-model:selected-artistry-model="selectedArtistryModel"
            v-model:selected-artistry-prompt-prefix="selectedArtistryPromptPrefix"
            v-model:selected-artistry-widget-instruction="selectedArtistryWidgetInstruction"
            v-model:selected-artistry-config-str="selectedArtistryConfigStr"
            :artistry-provider-options="artistryProviderOptions"
            :default-artistry-provider-placeholder="getDefaultPlaceholder(defaultArtistryProvider)"
          />
          <CardCreationTabProactivity
            v-else-if="activeTab === 'proactivity'"
            v-model:heartbeats-enabled="heartbeatsEnabled"
            v-model:heartbeats-interval-minutes="heartbeatsIntervalMinutes"
            v-model:heartbeats-prompt="heartbeatsPrompt"
            v-model:heartbeats-inject-into-prompt="heartbeatsInjectIntoPrompt"
            v-model:heartbeats-use-as-local-gate="heartbeatsUseAsLocalGate"
            v-model:heartbeats-schedule-start="heartbeatsScheduleStart"
            v-model:heartbeats-schedule-end="heartbeatsScheduleEnd"
            v-model:heartbeats-context-window-history="heartbeatsContextWindowHistory"
            v-model:heartbeats-context-system-load="heartbeatsContextSystemLoad"
            v-model:heartbeats-context-usage-metrics="heartbeatsContextUsageMetrics"
            :sensor-payload="sensorPayload"
            :static-sample-payload="staticSamplePayload"
          />
          <div class="ml-auto mr-1 flex flex-row gap-2">
            <Button
              variant="secondary"
              icon="i-solar:undo-left-bold-duotone"
              :label="t('settings.pages.card.cancel')"
              :disabled="false"
              @click="modelValue = false"
            />
            <Button
              variant="primary"
              icon="i-solar:check-circle-bold-duotone"
              :label="isEditMode ? t('settings.pages.card.save') : t('settings.pages.card.creation.create')"
              :disabled="false"
              @click="saveCard(card)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
