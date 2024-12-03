<script setup lang="ts">
import type {
  CoreAssistantMessage,
  CoreSystemMessage,
  CoreUserMessage,
} from 'ai'
import type {
  Emotion,
} from '../constants/emotions'

import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import Avatar from '../assets/live2d/models/hiyori_free_zh/avatar.png'
import { useMarkdown } from '../composables/markdown'

import { useQueue } from '../composables/queue'
import {
  useDelayMessageQueue,
  useEmotionsMessageQueue,
  useMessageContentQueue,
} from '../composables/queues'
import { llmInferenceEndToken } from '../constants'
import {
  EMOTION_EmotionMotionName_value,
  EmotionThinkMotionName,
} from '../constants/emotions'
import SystemPromptV2 from '../constants/prompts/system-v2'
import { useLLM } from '../stores/llm'
import { useSettings } from '../stores/settings'

import BasicTextarea from './BasicTextarea.vue'
// import AudioWaveform from './AudioWaveform.vue'
import Live2DViewer from './Live2DViewer.vue'
import Settings from './Settings.vue'

const nowSpeakingAvatarBorderOpacityMin = 30
const nowSpeakingAvatarBorderOpacityMax = 100

const { elevenLabsApiKey, openAiApiBaseURL, openAiApiKey } = storeToRefs(useSettings())
const openAIModel = useLocalStorage<{ id: string, name?: string }>('openai-model', { id: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT3.5 Turbo' })

const {
  setupOpenAI,
  streamSpeech,
  stream,
  models,
} = useLLM()
const { audioContext, calculateVolume } = useAudioContext()
const { process } = useMarkdown()

const listening = ref(false)
const live2DViewerRef = ref<{ setMotion: (motionName: string) => Promise<void> }>()
const supportedModels = ref<{ id: string, name?: string }[]>([])
const messageInput = ref<string>('')
const messages = ref<Array<CoreAssistantMessage | CoreUserMessage | CoreSystemMessage>>([SystemPromptV2 as CoreSystemMessage])
const streamingMessage = ref<CoreAssistantMessage>({ role: 'assistant', content: '' })
const audioAnalyser = ref<AnalyserNode>()
const mouthOpenSize = ref(0)
const nowSpeaking = ref(false)
const model = ref('')
const lipSyncStarted = ref(false)

const nowSpeakingAvatarBorderOpacity = computed<number>(() => {
  if (!nowSpeaking.value)
    return nowSpeakingAvatarBorderOpacityMin

  return ((nowSpeakingAvatarBorderOpacityMin
    + (nowSpeakingAvatarBorderOpacityMax - nowSpeakingAvatarBorderOpacityMin) * mouthOpenSize.value) / 100)
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
        // text: body.text,
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
      await live2DViewerRef.value!.setMotion(EMOTION_EmotionMotionName_value[ctx.data])
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue, messageContentQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.debug('emotion detected', emotion)
})

const delaysQueue = useDelayMessageQueue(emotionMessageContentQueue)
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

  const res = await stream(model.value, messages.value.slice(0, messages.value.length - 1))

  enum States {
    Literal = 'literal',
    Special = 'special',
  }

  let state = States.Literal
  let buffer = ''

  for await (const textPart of res.textStream) {
    for (const textSingleChar of textPart) {
      let newState: States = state

      if (textSingleChar === '<')
        newState = States.Special
      else if (textSingleChar === '>')
        newState = States.Literal

      if (state === States.Literal && newState === States.Special) {
        streamingMessage.value.content += buffer
        buffer = ''
      }

      if (state === States.Special && newState === States.Literal)
        buffer = '' // Clear buffer when exiting Special state

      if (state === States.Literal && newState === States.Literal) {
        streamingMessage.value.content += textSingleChar
        buffer = ''
      }

      await delaysQueue.add(textSingleChar)
      state = newState
      buffer += textSingleChar
    }
  }

  if (buffer)
    streamingMessage.value.content += buffer

  await delaysQueue.add(llmInferenceEndToken)

  messageInput.value = ''
}

watch([openAiApiBaseURL, openAiApiKey], async ([baseUrl, apiKey]) => {
  setupOpenAI({
    apiKey,
    baseURL: baseUrl,
  })

  const fetchedModels = await models()
  supportedModels.value = fetchedModels.data
})

onMounted(async () => {
  if (!openAiApiKey.value)
    return

  setupOpenAI({
    apiKey: openAiApiKey.value,
    baseURL: openAiApiBaseURL.value,
  })

  const fetchedModels = await models()
  supportedModels.value = fetchedModels.data
})

onUnmounted(() => {
  lipSyncStarted.value = false
})
</script>

<template>
  <div max-h="[100vh]" h-full p="2" flex="~ col">
    <Settings />
    <div flex="~ row 1" w-full items-end space-x-2>
      <div w-full min-h="100 sm:100">
        <Live2DViewer ref="live2DViewerRef" :mouth-open-size="mouthOpenSize" model="/assets/live2d/models/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json" />
      </div>
      <div my="2" w-full space-y-2 max-h="[calc(100vh-117px)]">
        <div v-for="(message, index) in messages" :key="index">
          <div v-if="message.role === 'assistant'" flex mr="12">
            <div
              mr-2 h-10 min-h-10 min-w-10 w-10 overflow-hidden rounded-full
              border="solid 3"
              transition="all ease-in-out" duration-100
              :style="{
                borderColor: `rgba(236, 72, 153, ${nowSpeakingAvatarBorderOpacity.toFixed(2)})`,
              }"
            >
              <img :src="Avatar">
            </div>
            <div flex="~ col" bg="pink-50/50 dark:pink-900/50" p="2" border="2 solid pink/10" rounded-lg>
              <div>
                <span font-semibold>Neuro</span>
              </div>
              <div v-html="process(message.content as string)" />
            </div>
          </div>
          <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
            <div border="purple solid 3" ml="2" h-10 min-h-10 min-w-10 w-10 overflow-hidden rounded-full>
              <div i-carbon:user-avatar-filled text="purple" h-full w-full p="0" m="0" />
            </div>
            <div flex="~ col" bg="purple-50/50 dark:purple-900/50" p="2" border="2 solid pink/10" rounded-lg>
              <div>
                <span font-semibold>You</span>
              </div>
              <div v-html="process(message.content as string)" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div my="2" space-x="2" flex="~ row" w-full self-end>
      <div flex="~ col" w-full space-y="2">
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
        <div absolute bottom="5" left="50%" translate-x="-50%">
          <button
            bg="zinc-100 dark:zinc-700" flex="~ row"
            items-center rounded-full px-4 py-2
            transition="all ease-in-out"
            @click="listening = !listening"
          >
            <Transition mode="out-in">
              <div v-if="listening" flex="~ row" items-center space-x-1>
                <div i-carbon:microphone-filled text-red />
                <span>
                  Listening...
                </span>
              </div>
              <div v-else flex="~ row" items-center space-x-1>
                <div i-carbon:microphone text-inherit />
                <span>
                  Talk
                </span>
              </div>
            </Transition>
          </button>
        </div>
        <BasicTextarea
          v-model="messageInput"
          placeholder="Message"
          p="2" bg="zinc-100 dark:zinc-700"
          w-full rounded-lg outline-none
          @submit="onSendMessage"
        />
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
</style>
