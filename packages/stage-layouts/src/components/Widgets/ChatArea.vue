<script setup lang="ts">
import type { ChatComposerController, ChatImageAttachment } from '@proj-airi/stage-ui/components/scenarios/chat'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { ChatImageAttachmentPreview, ChatReplyPreview, useChatImages } from '@proj-airi/stage-ui/components/scenarios/chat'
import { HearingConfig } from '@proj-airi/stage-ui/components/scenarios/dialogs/audio-input/index'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger, PopoverContent, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

import { useChatInterruption } from '../../composables/use-chat-interruption'
import { useTranscriptions } from '../../composables/use-transcriptions'

const props = defineProps<{
  composer: ChatComposerController<ChatImageAttachment>
  generating: boolean
}>()

const composerRoot = useTemplateRef<HTMLDivElement>('composer')

const imageInput = useTemplateRef<HTMLInputElement>('imageInput')
const chatSession = useChatSessionStore()
const { addFiles, selectFiles, error: imageError, pending: pendingImages } = useChatImages(props.composer, () => chatSession.activeSessionId)
const { attachments, removeAttachment } = props.composer

const messageInput = props.composer.draft
const hearingPopoverOpen = ref(false)
const isComposing = props.composer.isComposing
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const lastEnterTime = ref(0)

const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, stream } = storeToRefs(useSettingsAudioDevice())
const replyTarget = props.composer.replyTarget
const { audioContext } = useAudioContext()
const { t } = useI18n()
const sendModeLabels = computed<Record<SendMode, string>>(() => ({
  'enter': t('stage.send-mode.enter'),
  'ctrl-enter': t('stage.send-mode.ctrl-enter'),
  'double-enter': t('stage.send-mode.double-enter'),
}))

const { isListening, startStreamingTranscription, stopStreamingTranscription, autoSendEnabled } = useTranscriptions(
  {
    messageInputRef: messageInput,
    sendMessage: handleSend,
    isStageTamagotchi,
  },
)
const hasSubmission = computed(() => !!messageInput.value.trim() || attachments.value.length > 0)
const { showStopAction, stopActiveResponse, submitInterruptingResponse } = useChatInterruption({
  sessionId: computed(() => chatSession.activeSessionId),
  generating: computed(() => props.generating),
  hasSubmission,
  submit: async (hooks) => {
    await props.composer.submit({
      beforeSend: hooks && (submission => hooks.beforeSend(submission.sessionId)),
      afterSendStarted: hooks && (submission => hooks.afterSendStarted(submission.sessionId)),
    })
  },
})

const secondaryComposerButtonClass = [
  'size-8 flex items-center justify-center rounded-md outline-none',
  'text-neutral-500 transition-colors duration-200 active:bg-primary-100/80 dark:text-neutral-400 dark:active:bg-primary-900/60',
  'hover:bg-primary-100/60 hover:text-primary-600 dark:hover:bg-primary-900/40 dark:hover:text-primary-300 motion-reduce:transition-none',
]

const composerActionButtonClass = [
  'size-9 flex items-center justify-center rounded-full outline-none',
  'transition-colors duration-200 motion-reduce:transition-none',
]

async function handleSend() {
  if (!pendingImages.value)
    await submitInterruptingResponse()
}

async function handleCancelReply() {
  props.composer.clearReply()
  await nextTick()
  composerRoot.value?.querySelector('textarea')?.focus()
}

function sendFromKeyboard() {
  messageInput.value = messageInput.value.replace(TRAILING_NEWLINES_REGEX, '')
  void handleSend()
}

function handleMessageInputKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.key !== 'Enter')
    return

  const hasControl = event.ctrlKey || event.metaKey
  const hasShift = event.shiftKey

  switch (sendMode.value) {
    case 'enter':
      if (!hasShift && !hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'ctrl-enter':
      if (hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'double-enter':
      if (!hasShift && !hasControl) {
        const now = Date.now()
        if (now - lastEnterTime.value < DOUBLE_ENTER_INTERVAL_MS) {
          event.preventDefault()
          sendFromKeyboard()
          lastEnterTime.value = 0
        }
        else {
          lastEnterTime.value = now
        }
      }
  }
}

watch(hearingPopoverOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

const { startAnalyzer, stopAnalyzer } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function teardownAnalyzer() {
  try {
    analyzerSource?.disconnect()
  }
  catch {}
  analyzerSource = undefined
  stopAnalyzer()
}

async function setupAnalyzer() {
  teardownAnalyzer()
  if (!hearingPopoverOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([enabled], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
})

watch(sendMode, () => {
  lastEnterTime.value = 0
})

watch(replyTarget, async (target) => {
  if (!target)
    return

  await nextTick()
  composerRoot.value?.querySelector('textarea')?.focus()
})
</script>

<template>
  <div ref="composer" h="<md:full" flex gap-2 class="ph-no-capture">
    <div
      :class="[
        'relative w-full overflow-hidden rounded-t-xl',
        'border-t-2 border-solid border-primary-200/20 bg-primary-100/50 backdrop-blur-md',
        'dark:border-primary-400/20 dark:bg-primary-900/70',
      ]"
    >
      <ChatReplyPreview
        :target="replyTarget"
        @cancel="handleCancelReply"
      />
      <div v-if="attachments.length" :class="['flex gap-2 overflow-x-auto p-2']">
        <ChatImageAttachmentPreview v-for="(attachment, index) in attachments" :key="attachment.previewId" :file="attachment.file" @remove="removeAttachment(index)" />
      </div>
      <p v-if="imageError" role="alert" :class="['px-2 text-sm text-red-600']">
        {{ imageError }}
      </p>
      <p v-if="pendingImages" role="status">
        {{ t('stage.chat.images.reading') }}
      </p>

      <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple :class="['hidden']" @change="selectFiles">
      <BasicTextarea
        v-model="messageInput"
        :submit-on-enter="false"
        :placeholder="t('stage.message')"
        text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
        bg="transparent"
        min-h="[100px]" max-h="[300px]" w-full
        p-4 font-medium pb="[60px]"
        outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
        :class="{
          'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
        }"
        @keydown="handleMessageInputKeydown"
        @paste-file="addFiles"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />

      <!-- Input configuration controls -->
      <div
        absolute bottom-2 left-2 z-10 flex items-center gap-2
      >
        <button
          type="button"
          :aria-label="t('stage.chat.images.attach')"
          :class="secondaryComposerButtonClass"
          @click="imageInput?.click()"
        >
          <span :class="['i-solar:gallery-outline size-5']" />
        </button>
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button
              :class="secondaryComposerButtonClass"
              :title="t('stage.send-mode.title')"
              :aria-label="t('stage.send-mode.title')"
            >
              <div class="i-solar:keyboard-outline size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              side="top"
              align="start"
              :side-offset="8"
              :class="[
                'z-50 min-w-[180px] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-1',
                'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
                'flex flex-col gap-1',
              ]"
            >
              <DropdownMenuItem
                v-for="mode in SEND_MODES"
                :key="mode"
                :class="[
                  'w-full flex cursor-pointer items-center rounded-lg px-3 py-2 text-xs outline-none transition-colors',
                  'hover:bg-primary-100/60 dark:hover:bg-primary-900/40',
                  sendMode === mode ? 'bg-primary-100/60 text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-300' : 'text-neutral-600 dark:text-neutral-300',
                ]"
                @select="sendMode = mode"
              >
                <div class="mr-2 h-4 w-4 flex items-center justify-center">
                  <div v-if="sendMode === mode" class="i-ph:check-bold h-4 w-4" />
                </div>
                <span>{{ sendModeLabels[mode] }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>

        <!-- Microphone icon button -->
        <PopoverRoot v-model:open="hearingPopoverOpen">
          <PopoverTrigger as-child>
            <button
              :class="secondaryComposerButtonClass"
              :title="t('settings.hearing.title')"
              :aria-label="t('settings.hearing.title')"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" class="h-5 w-5" :color-class="isListening ? undefined : 'text-neutral-500 dark:text-neutral-400'" />
                <div v-else :class="['relative size-5 opacity-55']">
                  <div :class="['i-solar:microphone-3-outline size-5']" />
                  <span aria-hidden="true" :class="['absolute left-0 top-1/2 h-px w-full rotate-45 bg-current']" />
                </div>
              </Transition>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            :side-offset="8"
            :class="[
              'w-72 max-w-[18rem] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-4',
              'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
              'flex flex-col gap-3',
            ]"
          >
            <HearingConfig
              v-model:auto-send="autoSendEnabled"
              :transcription="isListening"
              :granted="true"
              @toggle-transcription="() => isListening ? stopStreamingTranscription() : startStreamingTranscription()"
            />
          </PopoverContent>
        </PopoverRoot>
      </div>

      <div
        absolute bottom-2 right-2 z-10 flex items-center gap-1
      >
        <button
          v-if="showStopAction"
          data-testid="stop-speaking-button"
          :class="[
            composerActionButtonClass,
            'bg-neutral-500/15 text-neutral-500 hover:bg-neutral-500/25 dark:bg-neutral-400/15 dark:text-neutral-300 dark:hover:bg-neutral-400/25',
          ]"
          :title="t('stage.chat.actions.stop')"
          :aria-label="t('stage.chat.actions.stop')"
          @click="stopActiveResponse"
        >
          <div class="i-solar:stop-bold-duotone h-4 w-4" />
        </button>
        <button
          v-else
          type="button"
          :aria-label="t('stage.chat.actions.send')"
          :disabled="!!pendingImages || (!messageInput.trim() && !attachments.length) || isComposing"
          :class="[
            composerActionButtonClass,
            'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40',
          ]"
          @click="handleSend"
        >
          <span :class="['i-solar:arrow-up-outline size-5']" />
        </button>
      </div>
    </div>
  </div>
</template>
