<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import { useMarkdown, useVRMLipSync } from '@proj-airi/stage-ui/composables'
import { useLive2DLipSync } from '@proj-airi/stage-ui/composables/live2d'
import { useChatStore } from '@proj-airi/stage-ui/stores'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const chatHistoryRef = ref<HTMLDivElement>()
const speakingMessageIndex = ref<number | null>(null)

const { t } = useI18n()
const { messages, sending } = storeToRefs(useChatStore())
const providersStore = useProvidersStore()

const { process } = useMarkdown()
const { onBeforeMessageComposed, onTokenLiteral } = useChatStore()


const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const audioContextStore = useAudioContext()
const { audioContext } = storeToRefs(audioContextStore)
const { stageView } = storeToRefs(useSettings())
const speakingStore = useSpeakingStore()
const { mouthOpenSize: globalMouthOpenSize, nowSpeaking } = storeToRefs(speakingStore)


const lipSyncUpdate = ref<((vrm: any) => void) | null>(null)
const live2dLipSync = ref<{ start: () => void, stop: () => void, mouthOpenSize: any } | null>(null)


function stripSSMLTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/<\|EMOTE_[^|]*\|>/g, '')
    .trim()
}


function isElevenLabsProvider(): boolean {
  return activeSpeechProvider.value === 'elevenlabs'
}

onBeforeMessageComposed(async () => {
  nextTick().then(() => {
    if (!chatHistoryRef.value)
      return

    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  })
})

onTokenLiteral(async () => {
  nextTick().then(() => {
    if (!chatHistoryRef.value)
      return

    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  })
})


async function speakMessage(messageIndex: number, text: string) {
  if (!activeSpeechProvider.value || !activeSpeechVoice.value || speakingMessageIndex.value !== null) {
    return
  }

  try {
    speakingMessageIndex.value = messageIndex
    
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      // Speech provider initialization error removed
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)


    let input: string
    if (isElevenLabsProvider()) {

      input = stripSSMLTags(text)
    } else {

      input = ssmlEnabled.value
        ? speechStore.generateSSML(text, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
        : text
    }

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })


    const audioBuffer = await audioContext.value.decodeAudioData(res)
    const source = audioContext.value.createBufferSource()
    source.buffer = audioBuffer
    

    if (stageView.value === '2d') {

      const lipSync = useLive2DLipSync(source)
      live2dLipSync.value = lipSync
      lipSync.start()
      nowSpeaking.value = true
      

      const stopWatcher = watch(lipSync.mouthOpenSize, (value: number) => {

        globalMouthOpenSize.value = value * 100
      })
      
      source.onended = () => {
        lipSync.stop()
        stopWatcher()
        live2dLipSync.value = null
        globalMouthOpenSize.value = 0
        nowSpeaking.value = false
        speakingMessageIndex.value = null
      }
    } else if (stageView.value === '3d' && !lipSyncUpdate.value) {
      const { update } = useVRMLipSync(source)
      lipSyncUpdate.value = update
      
      nowSpeaking.value = true
      
      source.onended = () => {
        nowSpeaking.value = false
        speakingMessageIndex.value = null
      }
    } else {
      nowSpeaking.value = true
      
      source.onended = () => {
        nowSpeaking.value = false
        speakingMessageIndex.value = null
      }
    }
    
    source.connect(audioContext.value.destination)
    source.start(0)
  } catch (error) {
    speakingMessageIndex.value = null
  }
}
</script>

<template>
  <div relative px="<sm:2" py="<sm:2" flex="~ col" rounded="lg" overflow-hidden h-120 min-h-120>
    <div ref="chatHistoryRef" v-auto-animate h-full w-full flex="~ col" overflow-scroll>
      <div v-for="(message, index) in messages" :key="index" mb-2>
        <div v-if="message.role === 'error'" flex mr="12">
          <div
            flex="~ col" border="2 solid violet-200/50 dark:violet-500/50" shadow="md violet-200/50 dark:none"
            min-w-20 rounded-lg px-2 py-1 h="unset <sm:fit" bg="<md:violet-500/25"
          >
            <div flex="~ row" gap-2>
              <div flex-1>
                <span text-xs text="violet-400/90 dark:violet-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.core-system') }}</span>
              </div>
              <div i-solar:danger-triangle-bold-duotone text-violet-500 />
            </div>
            <div v-if="sending && index === messages.length - 1" i-eos-icons:three-dots-loading />
            <div
              v-else class="markdown-content break-words text-violet-500" text="base <sm:xs"
              v-html="process(message.content as string)"
            />
          </div>
        </div>
        <div v-if="message.role === 'assistant'" flex mr="12">
          <div
            flex="~ col" border="2 solid primary-200/50 dark:primary-500/50" shadow="md primary-200/50 dark:none" min-w-20
            rounded-lg px-2 py-1 h="unset <sm:fit" bg="<md:primary-500/25" class="relative group"
          >
            <div>
              <span text-xs text="primary-400/90 dark:primary-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
            </div>
            <div v-if="message.content && index === messages.length - 1" class="markdown-content break-words" text="xs primary-400">
              <div v-for="(slice, sliceIndex) in message.slices" :key="sliceIndex">
                <div v-if="slice.type === 'tool-call'">
                  <div
                    p="1" border="1 solid primary-200" rounded-lg m="y-1" bg="primary-100"
                  >
                    Called: <code>{{ slice.toolCall.toolName }}</code>
                  </div>
                </div>
                <div v-else-if="slice.type === 'tool-call-result'" />
                <div v-else v-html="process(slice.text)" />
              </div>
            </div>
            <div v-else i-eos-icons:three-dots-loading />
            
    
            <button
              v-if="activeSpeechProvider && activeSpeechVoice && message.content"
              :disabled="speakingMessageIndex !== null"
              :class="[
                'absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-200 opacity-0 group-hover:opacity-100',
                speakingMessageIndex === index
                  ? 'bg-orange-500 text-white cursor-not-allowed'
                  : speakingMessageIndex !== null
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                    : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
              ]"
              @click="speakMessage(index, message.content as string)"
            >
              <div 
                :class="speakingMessageIndex === index ? 'i-eos-icons:three-dots-loading' : 'i-solar:play-bold'"
              />
            </button>
          </div>
        </div>
        <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
          <div
            flex="~ col" border="2 solid cyan-200/50 dark:cyan-500/50" shadow="md cyan-200/50 dark:none" px="2"
            h="unset <sm:fit" min-w-20 rounded-lg px-2 py-1 bg="<md:cyan-500/25"
          >
            <div>
              <span text-xs text="cyan-400/90 dark:cyan-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.you') }}</span>
            </div>
            <div v-if="message.content" class="markdown-content break-words" text="base <sm:xs" v-html="process(message.content as string)" />
            <div v-else />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
