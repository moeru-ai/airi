<script setup lang="ts">
import type { ChatComposerController, ChatImageAttachment } from '@proj-airi/stage-ui/components/scenarios/chat'

import { ChatImageAttachmentPreview, ChatReplyPreview, useChatImages, VoiceDrafts, VoiceInputButton } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useChatInterruption } from '../../composables/use-chat-interruption'

const props = defineProps<{
  composer: ChatComposerController<ChatImageAttachment>
  generating: boolean
}>()

const composerRoot = useTemplateRef<HTMLDivElement>('composer')
const voiceStatus = useTemplateRef<HTMLDivElement>('voiceStatus')
const voiceAttachment = useTemplateRef<HTMLDivElement>('voiceAttachment')
const voiceButton = useTemplateRef<InstanceType<typeof VoiceInputButton>>('voiceButton')
/** A recorded voice message waits for the send button. It can be sent without text. */
const voicePending = shallowRef(false)
/** A recording is open. Dictation writes into the text, so the text stays read-only and send waits until it closes. */
const voiceActive = shallowRef(false)
const router = useRouter()

const imageInput = useTemplateRef<HTMLInputElement>('imageInput')
const chatSession = useChatSessionStore()
const { addFiles, selectFiles, error: imageError, pending: pendingImages } = useChatImages(props.composer, () => chatSession.activeSessionId)
const { attachments, removeAttachment } = props.composer

const messageInput = props.composer.draft
const isComposing = props.composer.isComposing
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
type SendMode = 'enter' | 'ctrl-enter' | 'double-enter'
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const lastEnterTime = ref(0)

const { themeColorsHueDynamic } = storeToRefs(useSettings())

const replyTarget = props.composer.replyTarget
const { t } = useI18n()

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
  if (voiceActive.value || pendingImages.value)
    return

  // A waiting voice message takes the composer text into the same user message.
  const voice = await voiceButton.value?.sendPending(messageInput.value)
  if (voice === 'sent')
    messageInput.value = ''
  if (voice === 'sent' || voice === 'failed')
    return

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
  <VoiceDrafts />
  <div ref="composer" :class="['flex gap-2 <md:h-full', 'ph-no-capture']">
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

      <div ref="voiceAttachment" :class="['px-2 pt-2 empty:hidden']" />

      <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple :class="['hidden']" @change="selectFiles">
      <BasicTextarea
        v-model="messageInput"
        :submit-on-enter="false"
        :readonly="voiceActive"
        :placeholder="t('stage.message')"
        :class="[
          'max-h-[300px] min-h-[100px] w-full p-4 pb-[60px] font-medium outline-none',
          'bg-transparent text-primary-600 dark:text-primary-100',
          'placeholder:text-primary-500 dark:placeholder:text-primary-200',
          'transition-all duration-250 ease-in-out placeholder:transition-all placeholder:duration-250 placeholder:ease-in-out',
          themeColorsHueDynamic && 'transition-colors-none placeholder:transition-colors-none',
        ]"
        @keydown="handleMessageInputKeydown"
        @paste-file="addFiles"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />

      <div :class="['absolute inset-x-2 bottom-2 z-10 flex items-center gap-2']">
        <button
          type="button"
          :aria-label="t('stage.chat.images.attach')"
          :class="secondaryComposerButtonClass"
          @click="imageInput?.click()"
        >
          <span :class="['i-solar:gallery-outline size-5']" />
        </button>
        <!-- The voice control shows its recording status here, so the composer keeps its height. -->
        <div ref="voiceStatus" :class="['min-w-0 flex flex-1 items-center']" />
        <div :class="['flex shrink-0 items-center gap-1']">
          <VoiceInputButton
            ref="voiceButton"
            v-model="messageInput"
            :status-element="voiceStatus"
            :attachment-element="voiceAttachment"
            :session-id="chatSession.activeSessionId"
            :reply-to-message-id="replyTarget?.message.id"
            @recording-change="voiceActive = $event"
            @pending-change="voicePending = $event"
            @sent="props.composer.clearReply()"
            @submit="handleSend"
            @configure="router.push('/settings/modules/hearing')"
          />
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
            <div class="i-solar:stop-outline size-5" />
          </button>
          <button
            v-else
            type="button"
            :aria-label="t('stage.chat.actions.send')"
            :disabled="voiceActive || !!pendingImages || (!messageInput.trim() && !attachments.length && !voicePending) || isComposing"
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
  </div>
</template>
