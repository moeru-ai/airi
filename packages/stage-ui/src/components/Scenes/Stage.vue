<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import type { Emotion } from '../../constants/emotions'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'

import Live2DScene from './Live2D.vue'
import VRMScene from './VRM.vue'

import { useQueue } from '../../composables/queue'
import { useDelayMessageQueue, useEmotionsMessageQueue, useMessageContentQueue } from '../../composables/queues'
import { useLive2DLipSync } from '../../composables/live2d'
import { useVRMLipSync } from '../../composables/vrm'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { useLive2d, useVRM } from '../../stores'
import { useAudioContext } from '../../stores/audio'
import { useChatStore } from '../../stores/chat'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'

withDefaults(defineProps<{
  paused?: boolean
  focusAt: { x: number, y: number }
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
  mouthOpenSize?: number
}>(), { paused: false, scale: 1, mouthOpenSize: 0 })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<{ setExpression: (expression: string) => void }>()

const { stageView, stageViewControlsEnabled, live2dDisableFocus } = storeToRefs(useSettings())
const { audioContext } = useAudioContext()
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
const providersStore = useProvidersStore()
const { modelFile, modelUrl } = storeToRefs(useLive2d())
const { modelFile: vrmModelFile, modelUrl: vrmModelUrl } = storeToRefs(useVRM())

const nowSpeaking = ref(false)

// Lip sync states
const live2dMouthOpenSize = ref(0)
const vrmLipSyncUpdate = ref<((vrm: any) => void) | null>(null)
const live2dLipSync = ref<{ start: () => void, stop: () => void, mouthOpenSize: any } | null>(null)

const audioQueue = useQueue<{ audioBuffer: AudioBuffer, text: string }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        console.log('=== AUDIO QUEUE HANDLER START ===')
        console.log('AudioBuffer details:', {
          duration: ctx.data.audioBuffer.duration,
          sampleRate: ctx.data.audioBuffer.sampleRate,
          numberOfChannels: ctx.data.audioBuffer.numberOfChannels,
          length: ctx.data.audioBuffer.length
        })
        console.log('Current stage view:', stageView.value)
        console.log('AudioContext state:', audioContext.state)
        
        // Create an AudioBufferSourceNode
        const source = audioContext.createBufferSource()
        source.buffer = ctx.data.audioBuffer

        // Setup lip sync based on stage view
        if (stageView.value === '2d') {
          console.log('Setting up Live2D lip sync for audio buffer')
          // Setup Live2D lip sync
          const lipSync = useLive2DLipSync(source)
          live2dLipSync.value = lipSync
          lipSync.start()
          
          // Watch for mouth open size changes
          const stopWatcher = watch(lipSync.mouthOpenSize, (value) => {
            // Convert from 0-1 range to 0-100 range for Live2D
            live2dMouthOpenSize.value = value * 100
            console.log('Mouth open size updated:', value, '-> Live2D:', live2dMouthOpenSize.value)
          }, { immediate: true })
          
          source.onended = () => {
            console.log('Audio playback ended - Live2D mode')
            lipSync.stop()
            stopWatcher()
            live2dLipSync.value = null
            live2dMouthOpenSize.value = 0
            nowSpeaking.value = false
            resolve()
          }
        } else if (stageView.value === '3d') {
          console.log('Setting up VRM lip sync for audio buffer')
          // Setup VRM lip sync
          if (!vrmLipSyncUpdate.value) {
            const { update } = useVRMLipSync(source)
            vrmLipSyncUpdate.value = update
          }
          
          source.onended = () => {
            console.log('Audio playback ended - VRM mode')
            nowSpeaking.value = false
            resolve()
          }
        } else {
          console.log('No specific lip sync setup - basic audio playback')
          source.onended = () => {
            console.log('Audio playback ended - basic mode')
            nowSpeaking.value = false
            resolve()
          }
        }

        // IMPORTANT: Always connect audio to destination for actual sound output
        console.log('Connecting audio source to destination for sound output')
        source.connect(audioContext.destination)

        // Start playing the audio
        console.log('Starting audio playback...')
        nowSpeaking.value = true
        source.start(0)
        console.log('Audio source started successfully')
      })
    },
  ],
})

const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)

// Function to strip SSML tags and emotion keys for ElevenLabs models
function stripSSMLTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove SSML tags
    .replace(/<\|EMOTE_[^|]*\|>/g, '') // Remove emotion keys like <|EMOTE_HAPPY|>
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
}

// Function to check if provider is ElevenLabs (all models need SSML stripping)
function isElevenLabsProvider(): boolean {
  return activeSpeechProvider.value === 'elevenlabs'
}

async function handleSpeechGeneration(ctx: { data: string }) {
  try {
    console.log('=== SPEECH GENERATION START ===');
    console.log('Input text:', ctx.data);
    console.log('Speech configuration check:', {
      provider: activeSpeechProvider.value,
      model: activeSpeechModel.value,
      voice: activeSpeechVoice.value,
      voiceId: activeSpeechVoice.value?.id,
      configured: speechStore.configured
    })

    if (!activeSpeechProvider.value) {
      console.warn('No active speech provider configured')
      return
    }

    if (!activeSpeechVoice.value) {
      console.warn('No active speech voice configured')
      return
    }

    if (!speechStore.configured) {
      console.warn('Speech store not fully configured')
      return
    }

    // TODO: UnElevenLabsOptions
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

    // Handle ElevenLabs models - strip SSML tags and emotion markers
    let input: string
    console.log('Provider check - isElevenLabsProvider():', isElevenLabsProvider());
    console.log('activeSpeechProvider.value:', activeSpeechProvider.value);
    
    if (isElevenLabsProvider()) {
      // For ElevenLabs, always use plain text without SSML/emotion tags
      console.log('ElevenLabs provider detected, stripping SSML tags');
      console.log('Original text:', ctx.data);
      input = stripSSMLTags(ctx.data)
      console.log('Processed text:', input);
    } else {
      // For other providers, use SSML if enabled
      console.log('Non-ElevenLabs provider, using SSML if enabled:', ssmlEnabled.value);
      input = ssmlEnabled.value
        ? speechStore.generateSSML(ctx.data, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
        : ctx.data
      console.log('Other provider input:', input)
    }

    console.log('Generating speech with:', {
      provider: activeSpeechProvider.value,
      model: activeSpeechModel.value,
      voice: activeSpeechVoice.value?.id,
      inputLength: input.length
    })

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    console.log('Speech generated, ArrayBuffer size:', res.byteLength)

    // Decode the ArrayBuffer into an AudioBuffer
    const audioBuffer = await audioContext.decodeAudioData(res)
    console.log('AudioBuffer decoded:', {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels
    })
    
    await audioQueue.add({ audioBuffer, text: ctx.data })
  }
  catch (error) {
    console.error('Speech generation failed:', error)
  }
}

const ttsQueue = useQueue<string>({
  handlers: [
    handleSpeechGeneration,
  ],
})

ttsQueue.on('add', (content) => {
  // eslint-disable-next-line no-console
  console.debug('ttsQueue added', content)
})

const messageContentQueue = useMessageContentQueue(ttsQueue)

const { currentMotion } = storeToRefs(useLive2d())

const emotionsQueue = useQueue<Emotion>({
  handlers: [
    async (ctx) => {
      if (stageView.value === '3d') {
        const value = EMOTION_VRMExpressionName_value[ctx.data]
        if (!value)
          return

        await vrmViewerRef.value!.setExpression(value)
      }
      else if (stageView.value === '2d') {
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



onBeforeMessageComposed(async () => {
  // Setup for message composition
})

onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
})

onTokenLiteral(async (literal) => {
  await messageContentQueue.add(literal)
})

onTokenSpecial(async (special) => {
  await delaysQueue.add(special)
  await emotionMessageContentQueue.add(special)
})

onStreamEnd(async () => {
  await delaysQueue.add(llmInferenceEndToken)
})

onAssistantResponseEnd(async (_message) => {
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
})



onMounted(async () => {
  db.value = drizzle({ connection: { bundles: getImportUrlBundles() } })
  await db.value.execute(`CREATE TABLE memory_test (vec FLOAT[768]);`)
})
</script>

<template>
  <div relative>
    <div h-full w-full>
      <Live2DScene
        v-if="stageView === '2d'"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-src="modelUrl"
        :model-file="modelFile"
        :focus-at="focusAt"
        :mouth-open-size="live2dMouthOpenSize"
        :paused="paused"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="live2dDisableFocus"
      />
      <VRMScene
        v-else-if="stageView === '3d'"
        ref="vrmViewerRef"
        :model-src="vrmModelUrl"
        :model-file="vrmModelFile"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        @error="console.error"
      />
    </div>
  </div>
</template>
