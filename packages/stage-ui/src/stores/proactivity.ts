import type { ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { sensorsGetActiveWindow, sensorsGetIdleTime } from '@proj-airi/stage-shared'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw } from 'vue'

import { useLlmmarkerParser } from '../composables/llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from '../composables/response-categoriser'
import { useChatOrchestratorStore } from './chat'
import { useChatContextStore } from './chat/context-store'
import { useChatSessionStore } from './chat/session-store'
import { useLLM } from './llm'
import { useAiriCardStore } from './modules/airi-card'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

export const useProactivityStore = defineStore('proactivity', () => {
  const airiCardStore = useAiriCardStore()
  const { activeCard } = storeToRefs(airiCardStore)
  const chatSession = useChatSessionStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContext = useChatContextStore()
  const llmStore = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()

  const lastHeartbeatTime = ref<number>(0)
  const isHeartbeatEvaluating = ref(false)

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron
  const getIdleTimeInvoke = isElectron ? useElectronEventaInvoke(sensorsGetIdleTime) : null
  const getActiveWindowInvoke = isElectron ? useElectronEventaInvoke(sensorsGetActiveWindow) : null

  async function evaluateHeartbeat(options?: { force?: boolean }) {
    if (isHeartbeatEvaluating.value && !options?.force) {
      // eslint-disable-next-line no-console
      console.log('[Proactivity] Evaluation already in progress, skipping.')
      return
    }

    // eslint-disable-next-line no-console
    console.log('[Proactivity] Ticking evaluation loop...', { force: !!options?.force })

    if (!activeCard.value) {
      // eslint-disable-next-line no-console
      console.log('[Proactivity] Aborted: No active card selected.', { activeCard: activeCard.value })
      return
    }

    const config = activeCard.value?.extensions?.airi?.heartbeats
    if (!config?.enabled && !options?.force) {
      // eslint-disable-next-line no-console
      console.log('[Proactivity] Aborted: Heartbeats are disabled for this card.', { config })
      return
    }

    const now = new Date()

    // Check schedule
    if (!options?.force && config?.schedule && config.schedule.start && config.schedule.end) {
      const [startH, startM] = config.schedule.start.split(':').map(Number)
      const [endH, endM] = config.schedule.end.split(':').map(Number)
      const curH = now.getHours()
      const curM = now.getMinutes()

      const startMins = startH * 60 + startM
      const endMins = endH * 60 + endM
      const curMins = curH * 60 + curM

      // eslint-disable-next-line no-console
      console.log('[Proactivity] Checking Schedule:', {
        current: `${curH}:${curM} (${curMins}m)`,
        window: `${config.schedule.start} to ${config.schedule.end} (${startMins}m-${endMins}m)`,
      })

      if (startMins <= endMins) {
        if (curMins < startMins || curMins > endMins) {
          // eslint-disable-next-line no-console
          console.log('[Proactivity] Aborted: Current time is outside the permitted schedule window.')
          return
        }
      }
      else {
        // Crosses midnight
        if (curMins < startMins && curMins > endMins) {
          // eslint-disable-next-line no-console
          console.log('[Proactivity] Aborted: Current time is outside the permitted schedule window (across midnight).')
          return
        }
      }
    }

    // Check interval
    const intervalMs = (config?.intervalMinutes || 1) * 60 * 1000
    const timeSinceLast = now.getTime() - lastHeartbeatTime.value

    // eslint-disable-next-line no-console
    console.log('[Proactivity] Checking Interval:', {
      intervalMinutes: config?.intervalMinutes,
      elapsedMs: timeSinceLast,
      requiredMs: intervalMs,
      lastHeartbeat: new Date(lastHeartbeatTime.value).toLocaleTimeString(),
    })

    if (!options?.force && timeSinceLast < intervalMs) {
      // eslint-disable-next-line no-console
      console.log(`[Proactivity] Aborted: Interval of ${config?.intervalMinutes}m has not elapsed yet.`)
      return
    }

    let idleData = ''
    if (config?.useAsLocalGate || config?.injectIntoPrompt) {
      if (isElectron && getIdleTimeInvoke) {
        try {
          // eslint-disable-next-line no-console
          console.log('[Proactivity] Querying OS Sensors via Eventa...')
          const idleTime = await getIdleTimeInvoke()
          // eslint-disable-next-line no-console
          console.log(`[Proactivity] OS Sensor -> Idle Time: ${idleTime}ms`)

          // If useAsLocalGate is true, require at least 60 seconds of idle time
          if (!options?.force && config.useAsLocalGate && (idleTime === undefined || idleTime < 60000)) {
            // eslint-disable-next-line no-console
            console.log('[Proactivity] Aborted: Local Gate is active and user is not idle (> 60s).', { idleTime })
            return
          }

          if (config.injectIntoPrompt && getActiveWindowInvoke) {
            const activeWin = await getActiveWindowInvoke()
            // eslint-disable-next-line no-console
            console.log(`[Proactivity] OS Sensor -> Active Window: ${activeWin?.title} (${activeWin?.processName})`)
            idleData = `\n[Sensor Data]\nUser Idle Time: ${idleTime !== undefined ? Math.floor(idleTime / 1000) : 'unknown'} seconds\n`
            if (activeWin?.title) {
              idleData += `Active Window: ${activeWin.title} (${activeWin.processName})\n`
            }
          }
        }
        catch (err) {
          console.warn('[Proactivity] Failed to fetch OS sensors:', err)
        }
      }
      else {
        // eslint-disable-next-line no-console
        console.log('[Proactivity] Skipping sensors: Browser environment or invokers missing.')
      }
    }

    lastHeartbeatTime.value = now.getTime()
    isHeartbeatEvaluating.value = true

    try {
      const promptText = (config?.prompt || 'Evaluate heartbeat and situational context.') + idleData
      // eslint-disable-next-line no-console
      console.log(`[Proactivity] >>> TRIGGERING LLM <<< Prompt:\n${promptText}`)

      const messages: { role: 'system' | 'user' | 'assistant', content: string }[] = []

      if (airiCardStore.systemPrompt) {
        // I know this nu uh, better than loading all language on rehypeShiki (from chat session store)
        const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
        const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

        messages.push({
          role: 'system',
          content: codeBlockSystemPrompt + mathSyntaxSystemPrompt + airiCardStore.systemPrompt,
        })
      }

      const contextsSnapshot = chatContext.getContextsSnapshot()
      if (Object.keys(contextsSnapshot).length > 0) {
        messages.push({
          role: 'user',
          content: 'These are the contextual information retrieved or on-demand updated from other modules, you may use them as context for chat, or reference of the next action, tool call, etc.:\n'
            + `${Object.entries(contextsSnapshot).map(([key, value]) => `Module ${key}: ${JSON.stringify(value)}`).join('\n')}\n`,
        })
      }

      const sessionId = chatSession.activeSessionId
      const sessionMessages = chatSession.sessionMessages[sessionId] || []

      // Inject the last 10 messages for conversational context
      const recentMessages = sessionMessages.slice(-10)
      for (const msg of recentMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          let msgContent = ''
          if (typeof msg.content === 'string') {
            msgContent = msg.content
          }
          else if (Array.isArray(msg.content)) {
            msgContent = msg.content.map((part: any) => {
              if (typeof part === 'string')
                return part
              if (part && typeof part === 'object' && 'text' in part)
                return String(part.text ?? '')
              return ''
            }).join('')
          }
          if (msgContent) {
            messages.push({ role: msg.role, content: msgContent })
          }
        }
      }

      messages.push({ role: 'user', content: promptText })

      const activeProviderId = consciousnessStore.activeProvider
      const activeModel = consciousnessStore.activeModel

      if (!activeProviderId) {
        console.warn('[Proactivity] Aborted: No active LLM provider found.')
        return
      }

      // eslint-disable-next-line no-console
      console.log('[Proactivity] Resolving Provider Instance:', { activeProviderId, activeModel })
      const activeProvider = await providersStore.getProviderInstance(activeProviderId) as any

      if (!activeProvider) {
        console.warn('[Proactivity] Aborted: Failed to instantiate LLM provider.', { activeProviderId })
        return
      }

      const llmResponse = await llmStore.generate(activeModel, activeProvider, messages)
      const rawReply = llmResponse.text

      // eslint-disable-next-line no-console
      console.log(`[Proactivity] LLM Raw Response: "${rawReply}"`)

      const composedMessageSnapshot = toRaw(chatSession.sessionMessages[sessionId] || [])

      const rawStreamingContext: ChatStreamEventContext = {
        message: { role: 'user', content: '[Heartbeat Check]', createdAt: Date.now(), id: nanoid() },
        contexts: toRaw(chatContext.getContextsSnapshot()),
        composedMessage: composedMessageSnapshot as any,
      }

      // Deep clone to ensure serializability for IPC (prevents DataCloneError)
      const streamingContext = JSON.parse(JSON.stringify(rawStreamingContext))

      const buildingMessage: StreamingAssistantMessage = {
        role: 'assistant',
        content: '',
        slices: [],
        tool_results: [],
        createdAt: Date.now(),
        id: nanoid(),
      }

      await chatOrchestrator.emitBeforeMessageComposedHooks('[Proactive Heartbeat]', streamingContext)

      const categorizer = createStreamingCategorizer(activeProviderId)
      let streamPosition = 0

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          categorizer.consume(literal)
          const speechOnly = categorizer.filterToSpeech(literal, streamPosition)
          streamPosition += literal.length

          if (speechOnly.trim()) {
            buildingMessage.content += speechOnly
            await chatOrchestrator.emitTokenLiteralHooks(speechOnly, streamingContext)

            const lastSlice = buildingMessage.slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += speechOnly
            }
            else {
              buildingMessage.slices.push({ type: 'text', text: speechOnly })
            }
          }
        },
        onSpecial: async (special) => {
          await chatOrchestrator.emitTokenSpecialHooks(special, streamingContext)
        },
        onEnd: (fullText) => {
          const finalCategorization = categorizeResponse(fullText, activeProviderId)
          buildingMessage.categorization = {
            speech: finalCategorization.speech,
            reasoning: finalCategorization.reasoning,
          }
        },
      })

      await parser.consume(rawReply || '')
      await parser.end()

      const trimmedReply = (buildingMessage.content as string).trim()

      if (!trimmedReply) {
        // eslint-disable-next-line no-console
        console.log('[Proactivity] AI decided to remain silent.')
        return
      }

      // eslint-disable-next-line no-console
      console.log(`[Proactivity] Success! Injecting message into UI: ${trimmedReply}`)

      await chatOrchestrator.emitStreamEndHooks(streamingContext)
      await chatOrchestrator.emitAssistantResponseEndHooks(trimmedReply, streamingContext)

      if (!chatSession.sessionMessages[sessionId]) {
        chatSession.sessionMessages[sessionId] = []
      }
      chatSession.sessionMessages[sessionId].push(buildingMessage as any)
      chatSession.persistSessionMessages(sessionId)

      await chatOrchestrator.emitAssistantMessageHooks(buildingMessage, trimmedReply, streamingContext)
      await chatOrchestrator.emitChatTurnCompleteHooks({
        output: buildingMessage,
        outputText: trimmedReply,
        toolCalls: [],
      }, streamingContext)
    }
    catch (err) {
      console.error('[Proactivity] Error during heartbeat evaluation:', err)
    }
    finally {
      isHeartbeatEvaluating.value = false
    }
  }

  // Diagnostic Hook
  if (typeof window !== 'undefined') {
    (window as any).triggerHeartbeat = (force = true) => {
      // eslint-disable-next-line no-console
      console.log('[Proactivity] Manual trigger initiated via window.triggerHeartbeat')
      return evaluateHeartbeat({ force })
    }
  }

  return {
    lastHeartbeatTime,
    isHeartbeatEvaluating,
    evaluateHeartbeat,
  }
})
