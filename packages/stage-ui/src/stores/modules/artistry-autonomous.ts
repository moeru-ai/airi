import type { Message } from '@xsai/shared-chat'

import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { artistryGenerateHeadless } from '@proj-airi/stage-shared'
import { generateText } from '@xsai/generate-text'
import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { toast } from 'vue-sonner'

import { useAnalytics } from '../../composables/use-analytics'
import { useBackgroundStore } from '../background'
import { useChatSessionStore } from '../chat/session-store'
import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useArtistryStore } from './artistry'
import { useConsciousnessStore } from './consciousness'

const artistLog = import.meta.env.DEV ? console.info.bind(console, '[AutonomousArtist]') : () => {}

export const useAutonomousArtistryStore = defineStore('artistry-autonomous', () => {
  const cardStore = useAiriCardStore()
  const backgroundStore = useBackgroundStore()
  const artistryStore = useArtistryStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProviderStore()
  const chatSessionStore = useChatSessionStore()

  const isProcessing = ref(false)

  /**
   * Safe IPC Invoker for headless generation
   */
  const widgetsAdd = defineInvokeEventa<string | undefined, any>('eventa:invoke:electron:windows:widgets:add')

  const getGenerateHeadless = () => {
    const win = window as any
    if (typeof window !== 'undefined' && win.electron?.ipcRenderer) {
      const { context } = createContext(win.electron.ipcRenderer as any)
      return {
        addWidget: defineInvoke(context, widgetsAdd),
        generate: defineInvoke(context, artistryGenerateHeadless),
      }
    }
    return null
  }

  /**
   * Analyzes the context in parallel and triggers a visual if threshold is met.
   */
  async function runArtistTask(inputText: string, history: Message[] = [], targetOverride?: 'assistant' | 'user') {
    if (isProcessing.value) {
      artistLog('Skipping task: Already processing another task.')
      return
    }
    const { activeCard } = cardStore
    const artistry = activeCard?.extensions?.airi?.modules?.artistry
    const autonomousEnabled = artistry?.autonomousEnabled ?? false
    const target = targetOverride || artistry?.autonomousTarget || 'user'

    artistLog('Triggered runArtistTask. State:', {
      autonomousEnabled,
      cardId: cardStore.activeCardId,
      cardName: activeCard?.name,
      target,
    })

    if (!activeCard || !artistry || !autonomousEnabled) {
      return
    }

    const threshold = artistry.autonomousThreshold ?? 70
    const cardId = cardStore.activeCardId

    isProcessing.value = true
    artistLog('Starting analysis task...', { cardId, target, threshold })

    try {
      // 0. Guard: If the text is empty, skip analysis (Director cannot analyze silence)
      if (!inputText || inputText.trim() === '') {
        artistLog('Skipping analysis: Input text is empty.')
        return
      }

      // 1. Compose the "Director" prompt based on target
      const systemPrompt = target === 'assistant'
        ? `You are the Cinematic Director for AIRI. 
Your job is to analyze the character's response and reaction to the user, and decide if it warrants a visual manifestation (a generative image).
Manifestation is warranted for:
- Descriptions of beautiful scenery or environment changes in the response
- Expressive emotional reactions or body language from the character
- Direct mentions of food, items, or gifts in the narrative
- Narrative actions that would look stunning as a manga/anime scene
- Changes in the character's clothing or appearance

Character Personality: ${activeCard.personality}

Output EXACTLY this JSON format and nothing else:
{
  "reasoning": "Quick explanation of why this reaction warrants/doesn't warrant a visual",
  "intensity": 0-100,
  "prompt": "Highly detailed, illustrative prompt for the image generator capturing the character's reaction and scene. Use Mori's style (masterpiece, high quality, manga style, intricate details)",
  "title": "Short descriptive title for the scene"
}`
        : `You are the Cinematic Director for AIRI. 
Your job is to analyze the user's input and decide if it warrants a visual manifestation (a generative image).
Manifestation is warranted for:
- Descriptions of beautiful scenery or environment changes
- Direct mentions of food, items, or gifts
- Narrative actions that would look stunning as a manga/anime scene
- Changes in the character's clothing or appearance

Character Personality: ${activeCard.personality}

Output EXACTLY this JSON format and nothing else:
{
  "reasoning": "Quick explanation of why this warrants/doesn't warrant a visual",
  "intensity": 0-100,
  "prompt": "Highly detailed, illustrative prompt for the image generator. Use Mori's style (masterpiece, high quality, manga style, intricate details)",
  "title": "Short descriptive title for the scene"
}`

      // 2. Rollup history and text into a single prompt to help the LLM "see" the full context
      const recentHistory = history.slice(-3)
      const historyText = recentHistory.map(m => `[${m.role === 'assistant' ? 'Companion' : 'User'}]: ${m.content}`).join('\n\n')

      const analysisPrompt = `Consider the recent history between the user and the character for context and inspiration, then analyze the latest ${target === 'assistant' ? 'response from the companion' : 'input from the user'} to decide if a visual manifestation is needed.

--- 
CONTEXT HISTORY:
${historyText || '(No previous history)'}

---
LATEST ${target === 'assistant' ? 'COMPANION RESPONSE' : 'USER INPUT'}:
"${inputText}"`

      const messages: Message[] = [
        { content: systemPrompt, role: 'system' },
        {
          content: analysisPrompt,
          role: 'user',
        },
      ]

      const modelId = consciousnessStore.activeModel
      const providerId = consciousnessStore.activeProvider

      artistLog('Sending rolled-up prompt to Director LLM...', {
        historyCount: recentHistory.length,
        model: modelId,
        provider: providerId,
        target,
        textSubstring: inputText.substring(0, 50),
      })

      if (!modelId || !providerId) {
        throw new Error(`Missing LLM configuration (Model: ${modelId}, Provider: ${providerId})`)
      }

      const chatProvider = await providersStore.getProviderInstance(providerId) as any
      if (!chatProvider) {
        throw new Error(`Failed to resolve chat provider instance for: ${providerId}`)
      }

      // NOTICE: Artificial 10s delay for USER target to avoid race conditions/429s.
      // Skipped for ASSISTANT target as the main response is already finalized.
      if (target === 'user') {
        artistLog('User target detected. Applying 10s safety delay...')
        await new Promise(resolve => setTimeout(resolve, 10000))
      }

      // 2. Call LLM (Non-streaming for structured data)
      // Bypasses the chat orchestrator's llm_request_* funnel — emit a
      // dedicated event so Director LLM cost is separable from chat.
      useAnalytics().trackAutonomousGenerateText({
        model: modelId,
        reason: target,
      })
      const chatConfig = chatProvider.chat(modelId)
      const response = await generateText({
        ...chatConfig,
        headers: { 'Accept-Encoding': 'identity' },
        messages,
      })

      const rawContent = (response.text || '').trim()
      artistLog('Received raw response from Director LLM:', rawContent)

      // 3. Parse and analyze
      // Handle potential markdown fences: ```json ... ```
      let jsonContent = rawContent
      const fenceMatch = rawContent.match(/```(?:json)?\n?([\s\S]*?)```/)
      if (fenceMatch) {
        jsonContent = fenceMatch[1].trim()
        artistLog('Extracted JSON from fences:', jsonContent)
      }

      if (!jsonContent) {
        throw new Error('LLM returned empty content')
      }

      const analysis = JSON.parse(jsonContent)
      artistLog('Parsed Analysis Result:', {
        intensity: analysis.intensity,
        prompt: analysis.prompt,
        reasoning: analysis.reasoning,
        title: analysis.title,
      })

      const thresholdMet = (analysis.intensity ?? 0) >= threshold
      toast('Director\'s Decision', {
        description: `${thresholdMet ? '✅' : '❌'} Grade: ${analysis.intensity}/${threshold}\nReason: ${analysis.reasoning?.substring(0, 130)}${analysis.reasoning?.length > 130 ? '...' : ''}`,
        duration: 7000,
      })

      // 3. Evaluate Threshold
      if (analysis.intensity >= threshold) {
        artistLog(`Threshold met (${analysis.intensity} >= ${threshold}). Triggering generation...`)

        const invoker = getGenerateHeadless()
        if (!invoker) {
          artistLog('IPC Invoker not available (non-electron environment). Skipping generation.')
          return
        }

        const artistryGlobals = artistryStore.artistryGlobals
        const generationPayload = {
          globals: artistryGlobals,
          model: artistry.model || artistryStore.activeModel,
          options: artistry.options || artistryStore.providerOptions,
          prompt: artistry.promptPrefix ? `${artistry.promptPrefix} ${analysis.prompt}` : analysis.prompt,
          provider: artistry.provider || artistryStore.activeProvider,
        }

        artistLog('Triggering Headless Generation with payload:', generationPayload)

        const invokers = getGenerateHeadless()
        if (!invokers) {
          throw new Error('IPC invokers not available')
        }

        // Safety: ensure payload is a plain object for IPC serialization
        const plainPayload = JSON.parse(JSON.stringify(toRaw(generationPayload)))
        const result = await invokers.generate(plainPayload)

        if (result.error) {
          throw new Error(result.error)
        }

        artistLog('Headless Generation Success!', { hasBase64: !!result.base64, hasUrl: !!result.imageUrl })

        // 4. Save to journal
        if (result.base64 || result.imageUrl) {
          let blob: Blob
          if (result.base64) {
            const response = await fetch(result.base64)
            blob = await response.blob()
          }
          else {
            const response = await fetch(result.imageUrl!)
            blob = await response.blob()
          }

          const entryId = await backgroundStore.addBackground('journal', blob, analysis.title || 'Autonomous Scene', analysis.prompt, cardId)
          artistLog('Generation complete and added to journal.', { entryId })

          // 5. Route based on spawnMode
          const spawnMode = artistry.spawnMode || 'bg_widget'
          artistLog(`Routing image with mode: ${spawnMode}`)

          switch (spawnMode) {
            case 'bg':
              // Update character's active background
              await cardStore.updateCard(cardId, {
                extensions: {
                  ...activeCard.extensions,
                  airi: {
                    ...activeCard.extensions.airi,
                    modules: {
                      ...activeCard.extensions.airi.modules,
                      activeBackgroundId: entryId,
                    },
                  },
                },
              } as any)
              break

            case 'inline': {
              const imageUrl = result.imageUrl || result.base64
              const content = `![${analysis.title || 'Generated Image'}](${imageUrl})`
              chatSessionStore.appendSessionMessage(chatSessionStore.activeSessionId, {
                content,
                createdAt: Date.now(),
                role: 'assistant',
                slices: [{ text: content, type: 'text' }],
                tool_results: [],
              })
              break
            }

            case 'widget':
              try {
                await invokers.addWidget({
                  componentName: 'artistry',
                  componentProps: {
                    _skipIngestion: true,
                    entryId,
                    imageUrl: result.imageUrl || result.base64,
                    prompt: analysis.prompt,
                    status: 'done',
                    title: analysis.title || 'Autonomous Scene',
                  },
                  size: 'm',
                  ttlMs: 0,
                })
              }
              catch (widgetErr) {
                console.warn('[AutonomousArtist] Failed to spawn Result widget', widgetErr)
              }
              break

            case 'bg_widget':
            default:
              // Both: Update background AND spawn widget
              await cardStore.updateCard(cardId, {
                extensions: {
                  ...activeCard.extensions,
                  airi: {
                    ...activeCard.extensions.airi,
                    modules: {
                      ...activeCard.extensions.airi.modules,
                      activeBackgroundId: entryId,
                    },
                  },
                },
              } as any)

              try {
                await invokers.addWidget({
                  componentName: 'artistry',
                  componentProps: {
                    _skipIngestion: true,
                    entryId,
                    imageUrl: result.imageUrl || result.base64,
                    prompt: analysis.prompt,
                    status: 'done',
                    title: analysis.title || 'Autonomous Scene',
                  },
                  size: 'm',
                  ttlMs: 0,
                })
              }
              catch (widgetErr) {
                console.warn('[AutonomousArtist] Failed to spawn Result widget', widgetErr)
              }
              break
          }
        }
      }
      else {
        artistLog(`Intensity (${analysis.intensity}) below threshold (${threshold}). No action taken.`)
      }
    }
    catch (err) {
      artistLog('Task failed with error:', err)
    }
    finally {
      isProcessing.value = false
    }
  }

  return {
    isProcessing,
    runArtistTask,
  }
})
