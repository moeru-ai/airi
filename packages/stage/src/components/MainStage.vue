<script setup lang="ts">
import type { AssistantMessage, Message, SystemMessage } from '@xsai/shared-chat-completion'
import type { Emotion } from '../constants/emotions'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import { computed, onMounted, ref, watch } from 'vue'
import Avatar from '../assets/live2d/models/hiyori_free_zh/avatar.png'

import { useMarkdown } from '../composables/markdown'
import { useMicVAD } from '../composables/micvad'
import { useQueue } from '../composables/queue'
import { useDelayMessageQueue, useEmotionsMessageQueue, useMessageContentQueue } from '../composables/queues'
import { llmInferenceEndToken } from '../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../constants/emotions'
import SystemPromptV2 from '../constants/prompts/system-v2'
import { useLLM } from '../stores/llm'
import { useSettings } from '../stores/settings'
import { asyncIteratorFromReadableStream } from '../utils/iterator'

import BasicTextarea from './BasicTextarea.vue'
import Live2DViewer from './Live2DViewer.vue'
import Settings from './Settings.vue'
import ThreeDScene from './ThreeDScene.vue'

const nowSpeakingAvatarBorderOpacityMin = 30
const nowSpeakingAvatarBorderOpacityMax = 100

const {
  elevenLabsApiKey,
  openAiApiBaseURL,
  openAiApiKey,
  stageView,
} = storeToRefs(useSettings())
const openAIModel = useLocalStorage<{ id: string, name?: string }>('settings/llm/openai/model', { id: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT3.5 Turbo' })

const { streamSpeech, stream, models } = useLLM()
const { audioContext, calculateVolume } = useAudioContext()
const { process } = useMarkdown()
const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })

const listening = ref(false)
const live2DViewerRef = ref<{ setMotion: (motionName: string) => Promise<void> }>()
const vrmViewerRef = ref<{ setExpression: (expression: string) => void }>()
const supportedModels = ref<{ id: string, name?: string }[]>([])
const messageInput = ref<string>('')
const messages = ref<Array<Message>>([SystemPromptV2 as SystemMessage])
const streamingMessage = ref<AssistantMessage>({ role: 'assistant', content: '' })
const audioAnalyser = ref<AnalyserNode>()
const mouthOpenSize = ref(0)
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
const selectedAudioDevice = ref<MediaDeviceInfo>()

const selectedAudioDeviceId = computed(() => selectedAudioDevice.value?.deviceId)
const nowSpeakingAvatarBorderOpacity = computed<number>(() => {
  if (!nowSpeaking.value)
    return nowSpeakingAvatarBorderOpacityMin

  return ((nowSpeakingAvatarBorderOpacityMin
    + (nowSpeakingAvatarBorderOpacityMax - nowSpeakingAvatarBorderOpacityMin) * mouthOpenSize.value) / 100)
})

useMicVAD(selectedAudioDeviceId, {
  onSpeechStart: () => {
    // TODO: interrupt the playback
    // TODO: interrupt any of the ongoing TTS
    // TODO: interrupt any of the ongoing LLM requests
    // TODO: interrupt any of the ongoing animation of Live2D or VRM
    // TODO: once interrupted, we should somehow switch to listen or thinking
    //       emotion / expression?
    listening.value = true
  },
  // VAD misfire means while speech end is detected but
  // the frames of the segment of the audio buffer
  // is not enough to be considered as a speech segment
  // which controlled by the `minSpeechFrames` parameter
  onVADMisfire: () => {
    // TODO: do audio buffer send to whisper
    listening.value = false
  },
  onSpeechEnd: () => {
    // TODO: do audio buffer send to whisper
    listening.value = false
  },
})

function handleModelChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = supportedModels.value.find(m => m.id === target.value)
  if (!found) {
    openAIModel.value = undefined
    return
  }

  openAIModel.value = found
}

async function handleAudioInputChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = audioInputs.value.find(d => d.deviceId === target.value)
  if (!found) {
    selectedAudioDevice.value = undefined
    return
  }

  selectedAudioDevice.value = found
}

const audioQueue = useQueue<{ audioBuffer: AudioBuffer, text: string }>({
  handlers: [
    (ctx) => {
      return new Promise((resolve) => {
        // Create an AudioBufferSourceNode
        const source = audioContext.createBufferSource()
        source.buffer = ctx.data.audioBuffer

        // Connect the source to the AudioContext's destination (the speakers)
        source.connect(audioContext.destination)
        // Connect the source to the analyzer
        source.connect(audioAnalyser.value!)

        // Start playing the audio
        nowSpeaking.value = true
        source.start(0)
        source.onended = () => {
          nowSpeaking.value = false
          resolve()
        }
      })
    },
  ],
})

const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      const now = Date.now()
      const res = await streamSpeech('https://airi-api.ayaka.io', elevenLabsApiKey.value, ctx.data, {
        // voice: 'ShanShan',
        // Quite good for English
        voice: 'Myriam',
        // Beatrice is not 'childish' like the others
        // voice: 'Beatrice',
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.5,
        },
      })
      const elapsed = Date.now() - now

      // eslint-disable-next-line no-console
      console.debug('TTS took', elapsed, 'ms')

      // Decode the ArrayBuffer into an AudioBuffer
      const audioBuffer = await audioContext.decodeAudioData(res)
      await audioQueue.add({ audioBuffer, text: ctx.data })
    },
  ],
})

ttsQueue.on('add', (content) => {
  // eslint-disable-next-line no-console
  console.debug('ttsQueue added', content)
})

const messageContentQueue = useMessageContentQueue(ttsQueue)

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
        await live2DViewerRef.value!.setMotion(EMOTION_EmotionMotionName_value[ctx.data])
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

function getVolumeWithMinMaxNormalizeWithFrameUpdates() {
  requestAnimationFrame(getVolumeWithMinMaxNormalizeWithFrameUpdates)
  if (!nowSpeaking.value)
    return

  mouthOpenSize.value = calculateVolume(audioAnalyser.value!, 'linear')
}

function setupLipSync() {
  if (!lipSyncStarted.value) {
    getVolumeWithMinMaxNormalizeWithFrameUpdates()
    audioContext.resume()
    lipSyncStarted.value = true
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value)
    audioAnalyser.value = audioContext.createAnalyser()
}

async function onSendMessage(sendingMessage: string) {
  if (!sendingMessage)
    return

  setupLipSync()
  setupAnalyser()

  streamingMessage.value = { role: 'assistant', content: '' }
  messages.value.push({ role: 'user', content: sendingMessage })
  messages.value.push(streamingMessage.value)
  // const index = messages.value.length - 1
  live2DViewerRef.value?.setMotion(EmotionThinkMotionName)

  const res = await stream(openAiApiBaseURL.value, openAiApiKey.value, openAIModel.value.id, messages.value.slice(0, messages.value.length - 1))
  let fullText = ''

  const parser = useLlmmarkerParser({
    onLiteral: async (literal) => {
      await messageContentQueue.add(literal)
      streamingMessage.value.content += literal
    },
    onSpecial: async (special) => {
      await delaysQueue.add(special)
      await emotionMessageContentQueue.add(special)
    },
  })

  for await (const textPart of asyncIteratorFromReadableStream(res.textStream, async v => v)) {
    fullText += textPart
    await parser.consume(textPart)
  }

  await parser.end()
  await delaysQueue.add(llmInferenceEndToken)

  messageInput.value = ''

  // eslint-disable-next-line no-console
  console.debug('Full text:', fullText)
}

watch([openAiApiBaseURL, openAiApiKey], async ([baseUrl, apiKey]) => {
  if (!baseUrl || !apiKey) {
    supportedModels.value = []
    return
  }

  supportedModels.value = await models(baseUrl, apiKey)
})

onMounted(async () => {
  if (!openAiApiBaseURL.value || !openAiApiKey.value)
    return

  supportedModels.value = await models(openAiApiBaseURL.value, openAiApiKey.value)
})

onUnmounted(() => {
  lipSyncStarted.value = false
})
</script>

<template>
  <div h-full max-h="[100vh]" max-w="[100vw]" p="2" flex="~ col" overflow-hidden>
    <div flex="~" mb-1 w-full gap-2>
      <div flex="~ 1" w-full items-center gap-2 text-nowrap text-2xl>
        <div i-solar:cat-outline text="[#ed869d]" />
        <div font-cute>
          <span>アイリ</span>
        </div>
      </div>
      <Settings />
    </div>
    <div flex="~ row 1" max-h="[calc(100vh-220px)] <sm:[calc(100vh-320px)]" relative h-full w-full items-end gap-2>
      <Live2DViewer
        v-if="stageView === '2d'"
        ref="live2DViewerRef"
        :mouth-open-size="mouthOpenSize"
        model="/assets/live2d/models/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json"
        w="50%" min-w="50% <lg:full" min-h="100 sm:100" h-full flex-1
      />
      <ThreeDScene
        v-else-if="stageView === '3d'"
        ref="vrmViewerRef"
        model="/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm"
        idle-animation="/assets/vrm/animations/idle_loop.vrma"
        w="50%" min-w="50% <lg:full" min-h="100 sm:100" h-full flex-1
        @error="console.error"
      />
      <div
        class="relative <lg:(absolute bottom-0 from-zinc-800/80 to-zinc-800/0 bg-gradient-to-t p-2)"
        px="<sm:2" py="<sm:2" rounded="lg"
        w="50% <lg:full" flex="~ col 1" overflow-hidden max-h="[calc(100vh-220px)]"
      >
        <div h-full w-full overflow-scroll>
          <div v-for="(message, index) in messages" :key="index" mb-2>
            <div v-if="message.role === 'assistant'" flex mr="12">
              <div
                mr-2 h-10
                min-h-10 min-w-10 w-10
                overflow-hidden rounded-full
                border="solid 3"
                transition="all ease-in-out" duration-100
                :style="{
                  borderColor: `rgba(236, 72, 153, ${nowSpeakingAvatarBorderOpacity.toFixed(2)})`,
                }"
              >
                <img :src="Avatar">
              </div>
              <div
                flex="~ col"
                bg="pink-50 dark:pink-900"
                border="2 solid pink dark:pink-700"
                min-w-20 rounded-lg px-2 py-1
                h="unset <sm:fit"
              >
                <div>
                  <span text-xs text="white/50" font-semibold class="inline <sm:hidden">Airi</span>
                </div>
                <div v-if="message.content" class="markdown-content" text="base <sm:xs" v-html="process(message.content as string)" />
                <div v-else i-eos-icons:three-dots-loading />
              </div>
            </div>
            <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
              <div
                class="block <sm:hidden"
                border="purple solid 3"
                ml="2"
                h-10 min-h-10 min-w-10 w-10
                overflow-hidden rounded-full
              >
                <div i-carbon:user-avatar-filled text="purple" h-full w-full p="0" m="0" />
              </div>
              <div
                flex="~ col"
                bg="purple-50 dark:purple-900"
                px="2"
                border="2 solid purple dark:purple-700"

                h="unset <sm:fit" min-w-20 rounded-lg px-2 py-1
              >
                <div>
                  <span text-xs text="white/50" font-semibold class="inline <sm:hidden">You</span>
                </div>
                <div v-if="message.content" class="markdown-content" text="base <sm:xs" whitespace-nowrap v-html="process(message.content as string)" />
                <div v-else />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div flex="~ row" my="2" space-x="2" w-full self-end>
      <div flex="~ col" w-full space-y="2">
        <select
          p="2"
          bg="zinc-100 dark:zinc-700" w-full rounded-lg
          outline-none
          @change="handleAudioInputChange"
        >
          <option disabled>
            Select a Audio Input
          </option>
          <option v-if="selectedAudioDevice" :value="selectedAudioDevice.deviceId">
            {{ selectedAudioDevice.label }}
          </option>
          <option v-for="m in audioInputs" :key="m.deviceId" :value="m.deviceId">
            {{ m.label }}
          </option>
        </select>
        <select
          p="2"
          bg="zinc-100 dark:zinc-700" w-full rounded-lg
          outline-none
          @change="handleModelChange"
        >
          <option disabled>
            Select a model
          </option>
          <option v-if="openAIModel" :value="openAIModel.id">
            {{ 'name' in openAIModel ? `${openAIModel.name} (${openAIModel.id})` : openAIModel.id }}
          </option>
          <option v-for="m in supportedModels" :key="m.id" :value="m.id">
            {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
          </option>
        </select>
        <div flex gap-2>
          <BasicTextarea
            v-model="messageInput"
            placeholder="Message"
            p="2" bg="zinc-100 dark:zinc-700"
            w="[92%]" rounded-lg outline-none min-h="[100px]"
            @submit="onSendMessage"
          />
          <button
            flex="~ row"
            p="2" bg="zinc-100 dark:zinc-700"
            w="[8%]" items-center justify-center rounded-lg outline-none
            transition="all ease-in-out"
            @click="listening = !listening"
          >
            <Transition mode="out-in">
              <div v-if="listening" flex="~ row" items-center justify-center space-x-1>
                <div i-carbon:microphone-filled text-red />
              </div>
              <div v-else flex="~ row" items-center justify-center space-x-1>
                <div i-carbon:microphone text-inherit />
                <span>
                  Talk
                </span>
              </div>
            </Transition>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.markdown-content p {
  word-wrap: break-word;
  word-break: normal;
  text-overflow: ellipsis;
  text-wrap: auto;
  white-space: break-spaces;
  overflow-wrap: anywhere;
}
</style>
