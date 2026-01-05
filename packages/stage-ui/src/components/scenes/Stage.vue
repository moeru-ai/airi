<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { TextSegmentationItem } from '../../composables/queues'
import type { Emotion } from '../../constants/emotions'
import type { TTSChunkItem } from '../../utils/tts'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'

import Live2DScene from './Live2D.vue'
import PNGtuberScene from './PNGtuber.vue'

import { useDelayMessageQueue, useEmotionsMessageQueue, usePipelineCharacterSpeechPlaybackQueueStore, usePipelineWorkflowTextSegmentationStore } from '../../composables/queues'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useChatStore } from '../../stores/chat'
import { useLive2d } from '../../stores/live2d'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'
import { createQueue } from '../../utils/queue'

withDefaults(defineProps<{
  paused?: boolean
  focusAt: { x: number, y: number }
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), { paused: false, scale: 1 })

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof ThreeScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()
const pngtuberSceneRef = ref<InstanceType<typeof PNGtuberScene>>()

const textSegmentationStore = usePipelineWorkflowTextSegmentationStore()
const { onTextSegmented, clearHooks: clearTextSegmentationHooks } = textSegmentationStore
const { textSegmentationQueue } = storeToRefs(textSegmentationStore)
// WORKAROUND: clear previous hooks to avoid duplicate calls
//             due to re-mounting of this component when switching routes and stages.
//             We may need to find a way to better orchestrate the lifecycle of the event
//             listeners within specific scopes, e.g., perhaps, addEventListener with
//             group tag, then we can remove them all once, or perhaps, we could implement
//             every non-deterministic onXXX register function to remove registered listeners
//             when the onUnmounted lifecycle hook is called.
//             Another possible approach but not really work for every cases (such as character
//             pipeline here, we may have multiple characters? Or multiple chat instances?, etc.)
//             is to orchestrate the lifecycle of events for specific Character, sub-module like
//             Dreaming procedure, etc. in each entity's own store with all lifecycle contained.
//             We need better pattern (maybe learn from game engine) to power this kind of pipeline/
//             event-driven workflow to avoid unexpected behaviors while maintain flexibility.
clearTextSegmentationHooks()

const characterSpeechPlaybackQueue = usePipelineCharacterSpeechPlaybackQueueStore()
const { connectAudioContext, connectAudioAnalyser, connectLipSyncNode, clearAll, onPlaybackStarted, onPlaybackFinished } = characterSpeechPlaybackQueue
const { currentAudioSource, playbackQueue } = storeToRefs(characterSpeechPlaybackQueue)

const settingsStore = useSettings()
const { stageModelRenderer, stageViewControlsEnabled, live2dDisableFocus, stageModelSelectedUrl, stageModelSelected } = storeToRefs(settingsStore)
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const { audioContext } = useAudioContext()
connectAudioContext(audioContext)

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProvidersStore()
const live2dStore = useLive2d()
const vrmStore = useModelStore()

const showStage = ref(true)

// Caption + Presentation broadcast channels
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const assistantCaption = ref('')

type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })

// TODO: duplicate calls may happen if this component mounted multiple times
live2dStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
})

// TODO: duplicate calls may happen if this component mounted multiple times
vrmStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
})

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }

const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)

const { currentMotion } = storeToRefs(useLive2d())

const emotionsQueue = createQueue<Emotion>({
  handlers: [
    async (ctx) => {
      if (stageModelRenderer.value === 'vrm') {
        // console.debug("VRM emotion anime: ", ctx.data)
        const value = EMOTION_VRMExpressionName_value[ctx.data]
        if (!value)
          return

        await vrmViewerRef.value!.setExpression(value)
      }
      else if (stageModelRenderer.value === 'live2d') {
        currentMotion.value = { group: EMOTION_EmotionMotionName_value[ctx.data] }
      }
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.debug('emotion detected', emotion)
})

const delaysQueue = useDelayMessageQueue()
delaysQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.debug('delay detected', delay)
})

// Play special token: delay or emotion
function playSpecialToken(special: string) {
  delaysQueue.enqueue(special)
  emotionMessageContentQueue.enqueue(special)
}
onPlaybackFinished(({ special }) => {
  playSpecialToken(special)
})

async function handleSpeechGeneration(ctx: { data: TTSChunkItem }) {
  try {
    if (!activeSpeechProvider.value) {
      console.warn('No active speech provider configured')
      return
    }

    if (!activeSpeechVoice.value) {
      console.warn('No active speech voice configured')
      return
    }

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return
    }

    // console.debug("ctx.data.chunk is empty? ", ctx.data.chunk === "")
    // console.debug("ctx.data.special: ", ctx.data.special)
    if (ctx.data.chunk === '' && !ctx.data.special)
      return
    // If special token only and chunk = ""
    if (ctx.data.chunk === '' && ctx.data.special) {
      playSpecialToken(ctx.data.special)
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

onTextSegmented((chunkItem) => {
  ttsQueue.enqueue(chunkItem)
})

function startLipSyncLoop() {
  if (lipSyncLoopId.value)
    return

  const tick = () => {
    if (!nowSpeaking.value || !live2dLipSync.value) {
      mouthOpenSize.value = 0
    }
    else {
      mouthOpenSize.value = live2dLipSync.value.getMouthOpen()
    }
    lipSyncLoopId.value = requestAnimationFrame(tick)
  }

  lipSyncLoopId.value = requestAnimationFrame(tick)
}

async function setupLipSync() {
  if (lipSyncStarted.value)
    return

  try {
    const lipSync = await createLive2DLipSync(audioContext, wlipsyncProfile as Profile, live2dLipSyncOptions)
    live2dLipSync.value = lipSync
    connectLipSyncNode(lipSync.node)
    await audioContext.resume()
    startLipSyncLoop()
    lipSyncStarted.value = true
  }
  catch (error) {
    lipSyncStarted.value = false
    console.error('Failed to setup Live2D lip sync', error)
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
    connectAudioAnalyser(audioAnalyser.value)
  }
}

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  clearAll()
  setupAnalyser()
  await setupLipSync()
  // Reset assistant caption for a new message
  assistantCaption.value = ''
  postCaption({ type: 'caption-assistant', text: '' })
  postPresent({ type: 'assistant-reset' })
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  // Only push to segmentation; visual presentation happens on playback start
  textSegmentationQueue.value.enqueue({ type: 'literal', value: literal } as TextSegmentationItem)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  // delaysQueue.enqueue(special)
  // emotionMessageContentQueue.enqueue(special)
  // Also push special token to the queue for emotion animation/delay and TTS playback synchronisation
  textSegmentationQueue.value.enqueue({ type: 'special', value: special } as TextSegmentationItem)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

onUnmounted(() => {
  lipSyncStarted.value = false
})

onMounted(async () => {
  db.value = drizzle({ connection: { bundles: getImportUrlBundles() } })
  await db.value.execute(`CREATE TABLE memory_test (vec FLOAT[768]);`)
})

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()
  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()
  else if (stageModelRenderer.value === 'pngtuber')
    return pngtuberSceneRef.value?.canvasElement()
}

onUnmounted(() => {
  if (lipSyncLoopId.value) {
    cancelAnimationFrame(lipSyncLoopId.value)
    lipSyncLoopId.value = undefined
  }

  chatHookCleanups.forEach(dispose => dispose?.())
})

defineExpose({
  canvasElement,
})

onPlaybackFinished(() => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
})

onPlaybackStarted(({ text }) => {
  nowSpeaking.value = true
  // NOTICE: currently, postCaption, postPresent from useBroadcastChannel may throw error
  // once we navigate away from the page that created the BroadcastChannel,
  // as the channel gets closed on unmount, leading to "Failed to execute 'postMessage' on 'BroadcastChannel': The channel is closed."
  // error that may block hooks or throw exceptions silently.
  //
  // TODO: we should consider better way to manage BroadcastChannel lifecycle to avoid such issues.
  assistantCaption.value += ` ${text}`
  postCaption({ type: 'caption-assistant', text: assistantCaption.value })
  postPresent({ type: 'assistant-append', text })
})
</script>

<template>
  <div relative>
    <div h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        v-model:state="componentState" min-w="50% <lg:full" min-h="100 sm:100" h-full w-full
        flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :focus-at="focusAt"
        :mouth-open-size="mouthOpenSize"
        :paused="paused"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="live2dDisableFocus"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        :model-src="stageModelSelectedUrl"
        :idle-animation="animations.idleLoop.toString()"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :current-audio-source="currentAudioSource"
        @error="console.error"
      />
      <PNGtuberScene
        v-if="stageModelRenderer === 'pngtuber' && showStage"
        ref="pngtuberSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :focus-at="focusAt"
        :mouth-open-size="mouthOpenSize"
        :paused="paused"
      />
    </div>
  </div>
</template>
