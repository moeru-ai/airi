<script setup lang="ts">
import type { ChatProvider, SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { createPlaybackManager, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { useDelayMessageQueue, useEmotionsMessageQueue } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '@proj-airi/stage-ui/constants/emotions'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { createQueue } from '@proj-airi/stream-kit'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const sceneRef = ref<InstanceType<typeof ThreeScene>>()
const currentAudioSource = ref<AudioBufferSourceNode>()

const { audioContext } = useAudioContext()
const audioAnalyser = ref<AnalyserNode>()
function setupAnalyser() {
  if (!audioAnalyser.value)
    audioAnalyser.value = audioContext.createAnalyser()
}

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelected, stageModelSelectedUrl, stageViewControlsEnabled } = storeToRefs(settingsStore)

onMounted(async () => {
  const needsFallback = !stageModelSelectedUrl.value || stageModelRenderer.value !== 'vrm'
  if (needsFallback)
    stageModelSelected.value = 'preset-vrm-1'

  await settingsStore.updateStageModel()
  setupAnalyser()
})

const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { activeSpeechProvider, activeSpeechVoice, activeSpeechModel, ssmlEnabled, pitch } = storeToRefs(speechStore)
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)

const delaysQueue = useDelayMessageQueue()
const emotionMessageQueue = useEmotionsMessageQueue(createQueue({ handlers: [] }))

emotionMessageQueue.on('enqueue', (token) => {
  log(`    - special 入队：${token}`)
})

emotionMessageQueue.on('dequeue', (token) => {
  log(`special 出队处理：${token}`)
})

const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const nowSpeaking = ref(false)
const currentMotion = ref<{ group: string }>({ group: EmotionThinkMotionName })
const logLines = ref<string[]>([])
const chatInput = ref('')
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatMaintenance = useChatMaintenanceStore()
const chatMessages = computed(() => {
  return chatSession.messages
    .filter(msg => msg.role !== 'system')
    .map((msg) => {
      const text = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((part: any) => typeof part === 'string' ? part : part.text ?? '').join('')
          : JSON.stringify(msg.content ?? '')
      return { role: msg.role as 'user' | 'assistant', text }
    })
})

function log(line: string) {
  logLines.value = [line, ...logLines.value].slice(0, 50)
}

const playbackManager = createPlaybackManager<AudioBuffer>({
  play: (item, signal) => {
    return new Promise((resolve) => {
      const source = audioContext.createBufferSource()
      source.buffer = item.audio
      source.connect(audioContext.destination)
      if (audioAnalyser.value)
        source.connect(audioAnalyser.value)
      currentAudioSource.value = source

      const stopPlayback = () => {
        try {
          source.stop()
          source.disconnect()
        }
        catch {}
        if (currentAudioSource.value === source)
          currentAudioSource.value = undefined
        resolve()
      }

      if (signal.aborted) {
        stopPlayback()
        return
      }

      signal.addEventListener('abort', stopPlayback, { once: true })
      source.onended = () => {
        signal.removeEventListener('abort', stopPlayback)
        stopPlayback()
      }
      source.start(0)
    })
  },
  maxVoices: 1,
  maxVoicesPerOwner: 1,
  overflowPolicy: 'queue',
  ownerOverflowPolicy: 'steal-oldest',
})

const speechPipeline = createSpeechPipeline<AudioBuffer>({
  tts: async (request, signal) => {
    if (signal.aborted)
      return null

    if (!activeSpeechProvider.value || !activeSpeechVoice.value) {
      console.warn('No active speech provider configured')
      return null
    }

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return null
    }

    if (!request.text && !request.special)
      return null

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
    const input = ssmlEnabled.value
      ? speechStore.generateSSML(request.text, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
      : request.text

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    if (signal.aborted)
      return null

    log(`    - 排队：${request.text}${request.special ? ` [special: ${request.special}]` : ''}`)
    return audioContext.decodeAudioData(res)
  },
  playback: playbackManager,
})

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special)
    emotionMessageQueue.enqueue(segment.special)
})

playbackManager.onStart(({ item }) => {
  nowSpeaking.value = true
  log(`播放开始：${item.text}`)
})

playbackManager.onEnd(({ item }) => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0

  if (item.special) {
    log(`播放结束，special: ${item.special}`)
    const motion = EMOTION_EmotionMotionName_value[item.special as keyof typeof EMOTION_EmotionMotionName_value]
    const expression = EMOTION_VRMExpressionName_value[item.special as keyof typeof EMOTION_VRMExpressionName_value]
    if (motion)
      currentMotion.value = { group: motion }
    if (expression)
      sceneRef.value?.setExpression(expression)
  }
})

async function sendChat() {
  const content = chatInput.value.trim()
  if (!content)
    return

  const provider = await providersStore.getProviderInstance(activeChatProvider.value)
  if (!provider || !activeChatModel.value) {
    log('未配置聊天模型或 provider')
    return
  }

  try {
    await chatOrchestrator.ingest(content, {
      model: activeChatModel.value,
      chatProvider: provider as ChatProvider,
    })
    chatInput.value = ''
  }
  catch (err) {
    console.error(err)
    log('发送到 LLM 失败')
  }
}

function resetChat() {
  chatMaintenance.cleanupMessages()
  chatInput.value = ''
  logLines.value = []
  playbackManager.stopAll('reset')
}

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = chatOrchestrator
const chatHookCleanups: Array<() => void> = []
let currentIntent: ReturnType<typeof speechPipeline.openIntent> | null = null

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  playbackManager.stopAll('new-message')
  setupAnalyser()
  logLines.value = []
  currentIntent?.cancel('new-message')
  currentIntent = speechPipeline.openIntent({ priority: 'normal', behavior: 'queue' })
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentIntent?.writeLiteral(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  currentIntent?.writeSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
  currentIntent?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async () => {
  currentIntent?.end()
  currentIntent = null
}))

onUnmounted(() => {
  chatHookCleanups.forEach(dispose => dispose?.())
  playbackManager.stopAll('unmount')
})
</script>

<template>
  <div p-4 space-y-4>
    <div text-lg font-600>
      Performance Layer Playground（复刻 Stage，去掉 Live2D）
    </div>
    <div grid gap-4 lg:grid-cols-2>
      <div border="1 solid neutral-300/40 dark:neutral-700/40" h-100 min-h-80 overflow-hidden rounded-2xl>
        <ThreeScene
          v-if="stageModelRenderer === 'vrm'"
          ref="sceneRef"
          :model-src="stageModelSelectedUrl"
          :idle-animation="animations.idleLoop.toString()"
          :current-audio-source="currentAudioSource"
          :show-axes="stageViewControlsEnabled"
          :paused="false"
          @error="console.error"
        />
        <div v-else p-4 text-sm text-red-500>
          请选择 VRM 模型（当前模型类型不支持）。
        </div>
      </div>

      <div class="border border-neutral-300/50 rounded-xl p-3 text-xs leading-relaxed space-y-3 dark:border-neutral-700/60">
        <div font-600>
          聊天 / 播放
        </div>
        <div class="h-60 overflow-auto border border-neutral-200/60 rounded-lg p-2 dark:border-neutral-700/60">
          <div v-for="(msg, idx) in chatMessages" :key="idx" class="mb-2">
            <div class="text-[11px] text-neutral-500">
              {{ msg.role === 'user' ? 'User' : 'AIRI' }}
            </div>
            <div class="whitespace-pre-wrap break-words text-sm">
              {{ msg.text }}
            </div>
          </div>
          <div v-if="!chatMessages.length" class="text-sm text-neutral-500">
            输入消息进行对话。
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="chatInput"
            class="flex-1 border border-neutral-300/60 rounded-lg bg-white px-3 py-2 text-sm dark:bg-neutral-900/60"
            placeholder="输入消息，点击发送"
            @keyup.enter="sendChat"
          >
          <button
            class="rounded-lg bg-primary-500 px-3 py-2 text-white disabled:bg-neutral-400"
            :disabled="!chatInput.trim()"
            @click="sendChat"
          >
            发送
          </button>
          <button
            class="border border-neutral-300/60 rounded-lg px-3 py-2 text-sm"
            @click="resetChat"
          >
            重置对话
          </button>
        </div>
        <div class="border border-neutral-200/60 rounded-lg p-2 dark:border-neutral-700/60">
          <div mb-1 font-600>
            播放队列 / 日志
          </div>
          <ul class="max-h-60 overflow-auto space-y-1">
            <li v-for="line in logLines" :key="line">
              {{ line }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Performance Playground
  subtitleKey: tamagotchi.settings.devtools.title
</route>
