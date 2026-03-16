import type { ActiveWindowEntry, SystemLoadAverages } from '@proj-airi/stage-shared'

import type { ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { sensorsGetActiveWindow, sensorsGetActiveWindowHistory, sensorsGetIdleTime, sensorsGetLocalTime, sensorsGetSystemLoad } from '@proj-airi/stage-shared'
import { useIntervalFn } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, toRaw, watch } from 'vue'

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

  // eslint-disable-next-line no-console
  console.log('[Proactivity] Proactivity Store initialized.')

  const lastHeartbeatTime = ref<number>(Date.now())
  const isHeartbeatEvaluating = ref(false)
  let heartbeatInterval: any = null

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron
  const getIdleTimeInvoke = isElectron ? useElectronEventaInvoke(sensorsGetIdleTime) : null
  const getActiveWindowInvoke = isElectron ? useElectronEventaInvoke(sensorsGetActiveWindow) : null
  const getActiveWindowHistoryInvoke = isElectron ? useElectronEventaInvoke(sensorsGetActiveWindowHistory) : null
  const getSystemLoadInvoke = isElectron ? useElectronEventaInvoke(sensorsGetSystemLoad) : null
  const getLocalTimeInvoke = isElectron ? useElectronEventaInvoke(sensorsGetLocalTime) : null

  const idleTimeSec = ref<number | undefined>(undefined)
  const activeWinStr = ref('')
  const winHistory = ref<ActiveWindowEntry[]>([])
  const sysLoad = ref<SystemLoadAverages | null>(null)
  const locTime = ref('')

  const sessionMetrics = ref({
    ttsCount: 0,
    sttCount: 0,
    chatCount: 0,
  })
  const totalTurns = ref(0)
  const nextMilestone = ref(100)

  watch(activeCard, (card) => {
    const metrics = card?.extensions?.airi?.proactivity_metrics
    sessionMetrics.value = {
      ttsCount: metrics?.ttsCount ?? 0,
      sttCount: metrics?.sttCount ?? 0,
      chatCount: metrics?.chatCount ?? 0,
    }
    totalTurns.value = metrics?.totalTurns ?? 0
    nextMilestone.value = Math.ceil(Math.max(1, totalTurns.value + 1) / 100) * 100
  }, { immediate: true })

  function incrementMetric(type: 'tts' | 'stt' | 'chat') {
    const cardId = airiCardStore.activeCardId
    const card = activeCard.value
    if (!cardId || !card)
      return

    const metrics = {
      ttsCount: card.extensions?.airi?.proactivity_metrics?.ttsCount ?? 0,
      sttCount: card.extensions?.airi?.proactivity_metrics?.sttCount ?? 0,
      chatCount: card.extensions?.airi?.proactivity_metrics?.chatCount ?? 0,
      totalTurns: card.extensions?.airi?.proactivity_metrics?.totalTurns ?? 0,
    }

    if (type === 'chat') {
      metrics.chatCount += 1
      metrics.totalTurns += 1
    }
    else if (type === 'tts') {
      metrics.ttsCount += 1
    }
    else {
      metrics.sttCount += 1
    }

    sessionMetrics.value = {
      ttsCount: metrics.ttsCount,
      sttCount: metrics.sttCount,
      chatCount: metrics.chatCount,
    }
    totalTurns.value = metrics.totalTurns
    nextMilestone.value = Math.ceil(Math.max(1, totalTurns.value + 1) / 100) * 100

    airiCardStore.updateCard(cardId, {
      ...card,
      extensions: {
        ...card.extensions,
        airi: {
          ...card.extensions.airi,
          proactivity_metrics: metrics,
        },
      },
    })
  }

  async function updateSensors() {
    if (!isElectron)
      return

    try {
      if (getIdleTimeInvoke) {
        const idleMs = await getIdleTimeInvoke()
        idleTimeSec.value = idleMs !== undefined ? Math.floor(idleMs / 1000) : undefined
      }

      if (getActiveWindowInvoke) {
        const activeWin = await getActiveWindowInvoke()
        activeWinStr.value = activeWin?.title || ''
      }

      if (getActiveWindowHistoryInvoke) {
        winHistory.value = await getActiveWindowHistoryInvoke() || []
      }

      if (getSystemLoadInvoke) {
        sysLoad.value = await getSystemLoadInvoke()
      }

      if (getLocalTimeInvoke) {
        locTime.value = await getLocalTimeInvoke()
      }
    }
    catch (err) {
      console.warn('[Proactivity] Failed to poll sensors for preview:', err)
    }
  }

  const { pause } = useIntervalFn(updateSensors, 10000, { immediate: true })

  onUnmounted(() => {
    pause()
  })

  const sensorPayload = computed(() => {
    const config = activeCard.value?.extensions?.airi?.heartbeats
    const metrics = activeCard.value?.extensions?.airi?.proactivity_metrics
    let payload = '[Sensor Data]\n'

    payload += `User Idle: ${idleTimeSec.value !== undefined ? `${idleTimeSec.value}s` : 'unknown'}\n`

    if (config?.contextOptions?.windowHistory !== false) {
      if (winHistory.value.length > 0) {
        winHistory.value.slice(-3).forEach((entry) => {
          const start = new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          const end = new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          const durationSec = Math.floor(entry.durationMs / 1000)
          const durationStr = durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m`
          payload += `[ ${entry.window.processName} | ${entry.window.title} ] [ ${durationStr} ] [ ${start} - ${end} ]\n`
        })
      }
      else {
        payload += '[ Window History Empty ]\n'
      }
    }
    else {
      payload += 'Window History: [DISABLED]\n'
    }

    if (config?.contextOptions?.systemLoad !== false) {
      if (sysLoad.value) {
        payload += `CPU Load (1/5/15): ${sysLoad.value.cpu[0].toFixed(2)} | ${sysLoad.value.cpu[1].toFixed(2)} | ${sysLoad.value.cpu[2].toFixed(2)}\n`
        payload += `GPU Load (Avg): ${sysLoad.value.gpuAvg.toFixed(2)}\n`
      }
    }
    else {
      payload += 'System Load: [DISABLED]\n'
    }

    payload += `Current Local Time: ${locTime.value || 'unknown'}\n`

    if (config?.contextOptions?.usageMetrics !== false) {
      payload += '\n[Usage Metrics (Last Hr)]\n'
      payload += `TTS (Last Hr): ${metrics?.ttsCount ?? 0}\n`
      payload += `STT (Last Hr): ${metrics?.sttCount ?? 0}\n`
      payload += `Chat (Last Hr): ${metrics?.chatCount ?? 0}\n`
      payload += `Turn Count: ${totalTurns.value} (Next Target: ${nextMilestone.value})\n`
    }
    else {
      payload += '\n[Metrics]: [DISABLED]\n'
    }

    return payload
  })

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
    // Schedule check
    if (!options?.force && config?.schedule?.start && config.schedule.end) {
      const [startH, startM] = config.schedule.start.split(':').map(Number)
      const [endH, endM] = config.schedule.end.split(':').map(Number)
      const curH = now.getHours()
      const curM = now.getMinutes()
      const curMinsTotal = curH * 60 + curM
      const startMinsTotal = startH * 60 + startM
      const endMinsTotal = endH * 60 + endM

      const isInWindow = startMinsTotal <= endMinsTotal
        ? (curMinsTotal >= startMinsTotal && curMinsTotal <= endMinsTotal)
        : (curMinsTotal >= startMinsTotal || curMinsTotal <= endMinsTotal)

      if (!isInWindow) {
        // eslint-disable-next-line no-console
        console.log(`[Proactivity] Aborted: Outside schedule window (${config.schedule.start} - ${config.schedule.end}).`)
        return
      }
    }

    // Check interval
    // Check interval
    const intervalMs = (config?.intervalMinutes || 1) * 60 * 1000
    const timeSinceLast = now.getTime() - lastHeartbeatTime.value
    const timeLeftMs = Math.max(0, intervalMs - timeSinceLast)

    if (!options?.force && timeLeftMs > 0) {
      const mins = Math.floor(timeLeftMs / 60000)
      const secs = Math.floor((timeLeftMs % 60000) / 1000)
      // eslint-disable-next-line no-console
      console.log(`[Proactivity] Next evaluation due in: ${mins}m ${secs}s (Interval: ${config?.intervalMinutes}m)`)
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

          // If useAsLocalGate is true, abort if user is idle for more than 60 seconds (likely AFK)
          if (!options?.force && config.useAsLocalGate && (idleTime !== undefined && idleTime > 60000)) {
            // eslint-disable-next-line no-console
            console.log('[Proactivity] Aborted: Local Gate is active and user is idle (> 60s), likely AFK.', { idleTime })
            return
          }

          if (config.injectIntoPrompt) {
            await updateSensors()
            idleData = `\n${sensorPayload.value}`
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

      // Inject the last 6 messages (approx 3 turns) for conversational context
      const recentMessages = sessionMessages.slice(-6)
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

  function startHeartbeatLoop() {
    if (heartbeatInterval)
      stopHeartbeatLoop()

    // eslint-disable-next-line no-console
    console.log('[Proactivity] Starting global heartbeat loop (60s tick)...')
    heartbeatInterval = setInterval(() => {
      void evaluateHeartbeat()
    }, 60 * 1000)
  }

  function stopHeartbeatLoop() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  }

  return {
    sessionMetrics,
    totalTurns,
    nextMilestone,
    incrementMetric,
    sensorPayload,
    idleTimeSec,
    activeWinStr,
    winHistory,
    sysLoad,
    locTime,
    lastHeartbeatTime,
    isHeartbeatEvaluating,
    evaluateHeartbeat,
    startHeartbeatLoop,
    stopHeartbeatLoop,
  }
})
