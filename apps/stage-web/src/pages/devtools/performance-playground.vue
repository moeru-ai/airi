<script setup lang="ts">
import type { TTSChunkItem } from '@proj-airi/stage-ui/utils/tts'
import type { ChatProvider, SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { useDelayMessageQueue, useEmotionsMessageQueue, usePipelineCharacterSpeechPlaybackQueueStore, usePipelineWorkflowTextSegmentationStore } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '@proj-airi/stage-ui/constants/emotions'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { createQueue } from '@proj-airi/stage-ui/utils/queue'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

// VRM scene refs
const sceneRef = ref<InstanceType<typeof ThreeScene>>()

// Playback + lip sync (VRM uses currentAudioSource)
const characterSpeechPlaybackQueue = usePipelineCharacterSpeechPlaybackQueueStore()
const { connectAudioContext, connectAudioAnalyser, clearAll, onPlaybackStarted, onPlaybackFinished } = characterSpeechPlaybackQueue
const { currentAudioSource, playbackQueue } = storeToRefs(characterSpeechPlaybackQueue)

// Audio context / analyser
const { audioContext } = useAudioContext()
connectAudioContext(audioContext)
const audioAnalyser = ref<AnalyserNode>()
function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
    connectAudioAnalyser(audioAnalyser.value)
  }
}

// Settings + force VRM model
const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelected, stageModelSelectedUrl, stageViewControlsEnabled } = storeToRefs(settingsStore)
onMounted(async () => {
  // Preserve existing VRM selection if available; otherwise fall back to preset VRM
  const needsFallback = !stageModelSelectedUrl.value || stageModelRenderer.value !== 'vrm'
  if (needsFallback)
    stageModelSelected.value = 'preset-vrm-1'

  await settingsStore.updateStageModel()
  setupAnalyser()
})

// Speech
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { activeSpeechProvider, activeSpeechVoice, activeSpeechModel, ssmlEnabled, pitch } = storeToRefs(speechStore)
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)

// Text segmentation
const textSegmentationStore = usePipelineWorkflowTextSegmentationStore()
const { onTextSegmented, clearHooks: clearTextSegmentationHooks } = textSegmentationStore
const { textSegmentationQueue } = storeToRefs(textSegmentationStore)
clearTextSegmentationHooks()

// Emotion/delay queues (special tokens)
const delaysQueue = useDelayMessageQueue()
const emotionMessageQueue = useEmotionsMessageQueue(createQueue({ handlers: [] }))
emotionMessageQueue.on('enqueue', (token) => {
  log(`    - special 入队：${token}`)
})
emotionMessageQueue.on('dequeue', (token) => {
  log(`special 出队处理：${token}`)
})

// State
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const nowSpeaking = ref(false)
const currentMotion = ref<{ group: string }>({ group: EmotionThinkMotionName })
const logLines = ref<string[]>([])
const chatInput = ref('')
const chatStore = useChatStore()
const chatMessages = computed(() => {
  return chatStore.messages
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

// TTS generation handler
async function handleSpeechGeneration(ctx: { data: TTSChunkItem }) {
  try {
    if (!activeSpeechProvider.value || !activeSpeechVoice.value) {
      console.warn('No active speech provider configured')
      return
    }
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return
    }
    if (ctx.data.chunk === '' && !ctx.data.special)
      return
    if (ctx.data.chunk === '' && ctx.data.special) {
      // log(`特殊标记：${ctx.data.special}`)
      emotionMessageQueue.enqueue(ctx.data.special)
      return
    }
    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
    const input = ssmlEnabled.value
      ? speechStore.generateSSML(ctx.data.chunk, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
      : ctx.data.chunk

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    const audioBuffer = await audioContext.decodeAudioData(res)
    log(`    - 排队：${ctx.data.chunk}${ctx.data.special ? ` [special: ${ctx.data.special}]` : ''}`)
    playbackQueue.value.enqueue({ audioBuffer, text: ctx.data.chunk, special: ctx.data.special })
  }
  catch (error) {
    console.error('Speech generation failed:', error)
  }
}

const ttsQueue = createQueue<TTSChunkItem>({
  handlers: [
    handleSpeechGeneration,
  ],
})

// text segmentation hooks
onTextSegmented((chunkItem) => {
  ttsQueue.enqueue(chunkItem)
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
    await chatStore.send(content, {
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
  chatStore.cleanupMessages()
  chatInput.value = ''
  logLines.value = []
  clearAll()
}

// Chat hooks (reuse Stage pipeline but Live2D removed)
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd } = chatStore
const chatHookCleanups: Array<() => void> = []

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  clearAll()
  setupAnalyser()
  logLines.value = []
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  textSegmentationQueue.value.enqueue({ type: 'literal', value: literal })
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  textSegmentationQueue.value.enqueue({ type: 'special', value: special })
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
}))

// Wire playback to VRM + logs
onPlaybackFinished(({ special }) => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
  if (special) {
    log(`播放结束，special: ${special}`)
    const motion = EMOTION_EmotionMotionName_value[special as keyof typeof EMOTION_EmotionMotionName_value]
    const expression = EMOTION_VRMExpressionName_value[special as keyof typeof EMOTION_VRMExpressionName_value]
    if (motion)
      currentMotion.value = { group: motion }
    if (expression)
      sceneRef.value?.setExpression(expression)
  }
})

onPlaybackStarted(({ text }) => {
  nowSpeaking.value = true
  log(`播放开始：${text}`)
})

onUnmounted(() => {
  chatHookCleanups.forEach(dispose => dispose?.())
  clearAll()
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
</route>
