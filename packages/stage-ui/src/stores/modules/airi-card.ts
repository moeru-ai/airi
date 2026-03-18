import type { Card, ccv3 } from '@proj-airi/ccc'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useLive2d } from '@proj-airi/stage-ui-live2d'
import { useModelStore } from '@proj-airi/stage-ui-three'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { safeParse } from 'valibot'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '../../constants/prompts/artistry-instruction'
import { AiriCardSchema } from '../../types/card.schema'
import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from '../settings/stage-model'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  prompt: string
  injectIntoPrompt: boolean
  useAsLocalGate: boolean
  contextOptions?: {
    windowHistory: boolean
    systemLoad: boolean
    usageMetrics: boolean
  }
  schedule: {
    start: string // e.g., '09:00'
    end: string // e.g., '23:00'
  }
}

export interface ActingConfig {
  modelExpressionPrompt: string
  speechExpressionPrompt: string
  speechMannerismPrompt: string
}

export interface AiriExtension {
  modules: {
    consciousness: {
      provider: string // Example: "openai"
      model: string // Example: "gpt-4o"
      moduleConfigs?: Record<string, any>
    }

    speech: {
      provider: string // Example: "elevenlabs"
      model: string // Example: "eleven_multilingual_v2"
      voice_id: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
    }

    // ID from display-models store (e.g. 'preset-live2d-1', 'display-model-<nanoid>')
    displayModelId?: string
    // Legacy key from older local card revisions. Read-only for migration.
    selectedModelId?: string
  }

  artistry?: {
    provider?: string
    model?: string
    promptPrefix?: string
    widgetInstruction?: string
    options?: Record<string, any>
  }

  acting?: ActingConfig

  agents: {
    [key: string]: { // example: minecraft
      prompt: string
      enabled?: boolean
    }
  }

  heartbeats?: HeartbeatConfig
  proactivity_metrics?: {
    ttsCount: number
    sttCount: number
    chatCount: number
    totalTurns: number
  }
}

export interface AiriCard extends Card {
  extensions: {
    airi: AiriExtension
  } & Card['extensions']
}

export const useAiriCardStore = defineStore('airi-card', () => {
  const { t } = useI18n()
  const defaultSystemPrompt = t('settings.pages.card.creation.defaults.systemprompt')
  const defaultPostHistoryInstructions = t('settings.pages.card.creation.defaults.posthistoryinstructions')

  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi-cards', new Map())
  const activeCardId = useLocalStorageManualReset<string>('airi-card-active-id', 'default')

  const activeCard = computed(() => cards.value.get(activeCardId.value))

  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const stageModelStore = useSettingsStageModel()
  const displayModelsStore = useDisplayModelsStore()
  const live2dStore = useLive2d()
  const vrmStore = useModelStore()

  const {
    activeProvider: activeConsciousnessProvider,
    activeModel: activeConsciousnessModel,
  } = storeToRefs(consciousnessStore)

  const {
    activeSpeechProvider,
    activeSpeechVoiceId,
    activeSpeechModel,
  } = storeToRefs(speechStore)

  const addCard = (card: AiriCard | Card | ccv3.CharacterCardV3) => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newAiriCard(card))
    return newCardId
  }

  const removeCard = (id: string) => {
    cards.value.delete(id)
  }

  const updateCard = (id: string, updates: AiriCard | Card | ccv3.CharacterCardV3) => {
    const existingCard = cards.value.get(id)
    if (!existingCard)
      return false

    const updatedCard = {
      ...existingCard,
      ...updates,
    }

    cards.value.set(id, newAiriCard(updatedCard))
    return true
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  const getCardDisplayModelId = (id: string) => {
    const card = cards.value.get(id)
    if (!card)
      return undefined

    return resolveAiriExtension(card).modules?.displayModelId
  }

  async function applyCardState(card: AiriCard | undefined, force = false) {
    if (!card)
      return

    const extension = resolveAiriExtension(card)
    if (!extension)
      return

    activeConsciousnessProvider.value = extension.modules?.consciousness?.provider
    activeConsciousnessModel.value = extension.modules?.consciousness?.model

    activeSpeechProvider.value = extension.modules?.speech?.provider
    activeSpeechModel.value = extension.modules?.speech?.model
    activeSpeechVoiceId.value = extension.modules?.speech?.voice_id

    const newModelId = extension.modules?.displayModelId
    if (newModelId && (force || newModelId !== stageModelStore.stageModelSelected)) {
      stageModelStore.stageModelSelected = newModelId
      await stageModelStore.updateStageModel()

      const selectedModel = await displayModelsStore.getDisplayModel(newModelId)
      if (selectedModel?.format === DisplayModelFormat.Live2dZip)
        live2dStore.shouldUpdateView()
      else if (selectedModel?.format === DisplayModelFormat.VRM)
        vrmStore.shouldUpdateView()
    }
  }

  async function activateCard(id: string, force = false) {
    activeCardId.value = id
    await applyCardState(cards.value.get(id), force)
  }

  function resolveAiriExtension(card: Card | ccv3.CharacterCardV3): AiriExtension {
    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.airi
      : card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      consciousness: {
        provider: activeConsciousnessProvider.value,
        model: activeConsciousnessModel.value,
        moduleConfigs: {
          defaultPromptPrefix: t('base.prompt.prefix'),
        },
      },
      speech: {
        provider: activeSpeechProvider.value,
        model: activeSpeechModel.value,
        voice_id: activeSpeechVoiceId.value,
      },
      displayModelId: stageModelStore.stageModelSelected,
    }

    const defaultHeartbeats: HeartbeatConfig = {
      enabled: false,
      intervalMinutes: 30,
      prompt: '',
      injectIntoPrompt: true,
      useAsLocalGate: true,
      contextOptions: {
        windowHistory: true,
        systemLoad: true,
        usageMetrics: true,
      },
      schedule: {
        start: '09:00',
        end: '22:00',
      },
    }

    const defaultArtistry = {
      widgetInstruction: DEFAULT_ARTISTRY_WIDGET_INSTRUCTION,
    }

    const defaultActing: ActingConfig = {
      modelExpressionPrompt: `## Instruction: ACT Tokens
Start every reply with an ACT token to indicate your initial mood or action. If your synchronization or focus changes, insert a new ACT token. One token lasts until you use a new one.

**ACT JSON format (all fields optional):**
\`<|ACT:"emotion":{"name": expression_name, "intensity": 1},"motion":"action cue"|>\`

## Available Expressions (Keys)
Use these EXACT names in your ACT tokens:
`,
      speechExpressionPrompt: `## Instruction: Speech Tags
When the active voice provider supports expressive speech tags, you may use them inline to shape delivery.

Use square-bracket tags like \`[whisper]\` or \`[gasp]\` only when they improve the line.
- Keep them sparse and readable.
- Prefer one strong tag over many weak ones.
- Match the tag to the emotional beat of the sentence.
`,
      speechMannerismPrompt: `## Instruction: Speech Mannerisms
Use provider-supported speech mannerisms only when they help communicate tone or attitude.

- Keep them occasional and intentional.
- Use them to reinforce personality, not every line.
- Favor clarity first, style second.
`,
    }

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: defaultModules,
        acting: defaultActing,
        agents: {},
        heartbeats: defaultHeartbeats,
        artistry: defaultArtistry,
      }
    }

    // Merge existing extension with defaults
    const resolvedDisplayModelId = existingExtension.modules?.displayModelId
      ?? existingExtension.modules?.selectedModelId
      ?? defaultModules.displayModelId

    return {
      modules: {
        consciousness: {
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        speech: {
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
        displayModelId: resolvedDisplayModelId,
      },
      artistry: {
        ...existingExtension.artistry,
        widgetInstruction: existingExtension.artistry?.widgetInstruction ?? defaultArtistry.widgetInstruction,
      },
      acting: {
        modelExpressionPrompt: existingExtension.acting?.modelExpressionPrompt ?? defaultActing.modelExpressionPrompt,
        speechExpressionPrompt: existingExtension.acting?.speechExpressionPrompt ?? defaultActing.speechExpressionPrompt,
        speechMannerismPrompt: existingExtension.acting?.speechMannerismPrompt ?? defaultActing.speechMannerismPrompt,
      },
      agents: existingExtension.agents ?? {},
      heartbeats: {
        enabled: existingExtension.heartbeats?.enabled ?? defaultHeartbeats.enabled,
        intervalMinutes: existingExtension.heartbeats?.intervalMinutes ?? defaultHeartbeats.intervalMinutes,
        prompt: existingExtension.heartbeats?.prompt ?? defaultHeartbeats.prompt,
        injectIntoPrompt: existingExtension.heartbeats?.injectIntoPrompt ?? defaultHeartbeats.injectIntoPrompt,
        useAsLocalGate: existingExtension.heartbeats?.useAsLocalGate ?? defaultHeartbeats.useAsLocalGate,
        contextOptions: {
          windowHistory: existingExtension.heartbeats?.contextOptions?.windowHistory ?? defaultHeartbeats.contextOptions!.windowHistory,
          systemLoad: existingExtension.heartbeats?.contextOptions?.systemLoad ?? defaultHeartbeats.contextOptions!.systemLoad,
          usageMetrics: existingExtension.heartbeats?.contextOptions?.usageMetrics ?? defaultHeartbeats.contextOptions!.usageMetrics,
        },
        schedule: {
          start: existingExtension.heartbeats?.schedule?.start ?? defaultHeartbeats.schedule.start,
          end: existingExtension.heartbeats?.schedule?.end ?? defaultHeartbeats.schedule.end,
        },
      },
      proactivity_metrics: {
        ttsCount: existingExtension.proactivity_metrics?.ttsCount ?? 0,
        sttCount: existingExtension.proactivity_metrics?.sttCount ?? 0,
        chatCount: existingExtension.proactivity_metrics?.chatCount ?? 0,
        totalTurns: existingExtension.proactivity_metrics?.totalTurns ?? 0,
      },
    }
  }

  function newAiriCard(card: Card | ccv3.CharacterCardV3): AiriCard {
    const validation = safeParse(AiriCardSchema, card)
    if (!validation.success) {
      console.warn('[AiriCard] Validation issues found during normalization:', validation.issues)
      // We still proceed with normalization for robustness, but we've logged the problems.
      // In a stricter implementation, we could throw here.
    }

    const normalizeVersion = (version?: string | null) => {
      const normalized = version?.trim()
      return normalized || '1.0.0'
    }
    const normalizeRequiredText = (value: string | null | undefined, fallback: string) => {
      const normalized = value?.trim()
      return normalized || fallback
    }

    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: normalizeVersion(ccv3Card.data.character_version),
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: normalizeRequiredText(ccv3Card.data.system_prompt, defaultSystemPrompt),
        postHistoryInstructions: normalizeRequiredText(ccv3Card.data.post_history_instructions, defaultPostHistoryInstructions),
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          airi: resolveAiriExtension(ccv3Card),
          ...ccv3Card.data.extensions,
        },
      }
    }

    return {
      ...card,
      version: normalizeVersion(card.version),
      systemPrompt: normalizeRequiredText(card.systemPrompt, defaultSystemPrompt),
      postHistoryInstructions: normalizeRequiredText(card.postHistoryInstructions, defaultPostHistoryInstructions),
      extensions: {
        airi: resolveAiriExtension(card),
        ...card.extensions,
      },
    }
  }

  function initialize() {
    const normalizedCards = new Map<string, AiriCard>()
    for (const [id, card] of cards.value.entries()) {
      normalizedCards.set(id, newAiriCard(card))
    }
    cards.value = normalizedCards

    if (cards.value.has('default'))
      return
    cards.value.set('default', newAiriCard({
      name: 'ReLU',
      version: '1.0.0',
      description: SystemPromptV2(
        t('base.prompt.prefix'),
        t('base.prompt.suffix'),
      ).content,
    }))
    if (!activeCardId.value)
      activeCardId.value = 'default'
  }

  watch(activeCard, async (newCard: AiriCard | undefined) => {
    await applyCardState(newCard)
  })

  function resetState() {
    activeCardId.reset()
    cards.reset()
  }

  return {
    cards,
    activeCard,
    activeCardId,
    activateCard,
    addCard,
    removeCard,
    updateCard,
    getCard,
    getCardDisplayModelId,
    resetState,
    initialize,

    currentModels: computed(() => {
      return {
        consciousness: {
          provider: activeConsciousnessProvider.value,
          model: activeConsciousnessModel.value,
        },
        speech: {
          provider: activeSpeechProvider.value,
          model: activeSpeechModel.value,
          voice_id: activeSpeechVoiceId.value,
        },
        displayModelId: stageModelStore.stageModelSelected,
      } satisfies AiriExtension['modules']
    }),

    systemPrompt: computed(() => {
      const card = activeCard.value
      if (!card)
        return ''

      const components = [
        card.systemPrompt,
        card.description,
        card.personality,
      ].filter(Boolean)

      const acting = card.extensions?.airi?.acting
      if (acting) {
        components.push(
          acting.modelExpressionPrompt,
          acting.speechExpressionPrompt,
          acting.speechMannerismPrompt,
        )
      }

      if (card.extensions?.airi?.artistry?.provider && card.extensions?.airi?.artistry?.widgetInstruction) {
        components.push(card.extensions.airi.artistry.widgetInstruction)
      }

      return components.join('\n')
    }),
  }
})
