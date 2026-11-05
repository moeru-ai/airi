<script setup lang="ts">
import type { ChatComposerController, ChatImageAttachment } from '@proj-airi/stage-ui/components/scenarios/chat'

import { captureScreenSnapshotFile, isScreenCaptureSupported } from '@proj-airi/stage-shared'
import { ChatComposerAddMenu, ChatComposerVoiceInput, ChatImageAttachmentPreview, ChatProviderSetupCallout, ChatReplyPreview, ChatSendButton, useChatImages, useStartVoiceCall, VoicePresence } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useVoiceCallStore } from '@proj-airi/stage-ui/stores/voice-call'
import { BasicButton, BasicTextarea } from '@proj-airi/ui'
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
const voiceButton = useTemplateRef<InstanceType<typeof ChatComposerVoiceInput>>('voiceButton')
/** A recorded voice message waits for the send button. It can be sent without text. */
const voicePending = shallowRef(false)
/** A recording is open. Its transcript is not in the text yet, so send waits until it closes. */
const voiceRecording = shallowRef(false)
const router = useRouter()
const call = useVoiceCallStore()
const startVoiceCall = useStartVoiceCall(route => router.push(route), () => !voiceRecording.value)

const imageInput = useTemplateRef<HTMLInputElement>('imageInput')
const chatSession = useChatSessionStore()
const { addFiles, selectFiles, error: imageError, pending: pendingImages } = useChatImages(props.composer, () => chatSession.activeSessionId)
const isCapturingScreen = shallowRef(false)
const canCaptureScreen = computed(() => isScreenCaptureSupported())

async function handleCaptureScreen() {
  if (isCapturingScreen.value)
    return
  isCapturingScreen.value = true
  try {
    const file = await captureScreenSnapshotFile()
    if (file) {
      await addFiles([file])
    }
  }
  finally {
    isCapturingScreen.value = false
  }
}
const { attachments, removeAttachment } = props.composer

const messageInput = props.composer.draft
const isComposing = props.composer.isComposing
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
type SendMode = 'enter' | 'ctrl-enter' | 'double-enter'
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const lastEnterTime = ref(0)

const { themeColorsHueDynamic } = storeToRefs(useSettings())
const { chatReady } = storeToRefs(useConsciousnessStore())
const authStore = useAuthStore()

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

const composerActionButtonClass = [
  'size-9 flex items-center justify-center rounded-full outline-none',
  'transition-colors duration-200 motion-reduce:transition-none',
]

async function handleSend() {
  // The draft stays in the composer while the setup callout is shown.
  if (voiceRecording.value || pendingImages.value || !chatReady.value)
    return

  // A waiting voice message takes the composer text into the same user message.
  const voice = await voiceButton.value?.sendPending(messageInput.value)
  if (voice === 'sent')
    messageInput.value = ''
  // A failed send keeps the text for a retry. A send that still runs, for example after a double Enter, clears it itself.
  if (voice && voice !== 'none')
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
  <!--
    Speech and drafts show above the composer, also during a call. The text field below stays free while the user
    speaks. The call capsule at the top of the page holds the call status and the hang-up button.
  -->
  <div :class="['flex justify-center empty:hidden', 'px-1 pb-2']">
    <VoicePresence>
      <template #hint>
        <kbd
          :class="[
            'min-w-6 rounded-md border px-1.5 py-0.5 text-center font-sans text-[11px] leading-none',
            'border-neutral-900/15 bg-neutral-900/5 text-neutral-600',
            'dark:border-white/15 dark:bg-white/8 dark:text-neutral-300',
          ]"
        >esc</kbd>
        <span>{{ t('stage.chat.voice-draft.dismiss') }}</span>
      </template>
    </VoicePresence>
  </div>
  <div
    v-if="!chatReady"
    :class="[
      'mb-1 px-2',
      // The callout takes the panel width. Its content must not widen the panel.
      'w-0 min-w-full',
    ]"
  >
    <ChatProviderSetupCallout @configure="router.push('/settings/providers')" @sign-in="authStore.requestLogin()" />
  </div>
  <!--
    The composer keeps a 0.5rem inset from the panel edges, like the chat history above it.
    The corner radius is the `rounded-xl` of ChatContainer minus this inset, so the two corners stay concentric.
  -->
  <div ref="composer" :class="['flex gap-2 px-2 pb-2 <md:h-full', 'ph-no-capture']">
    <div
      :class="[
        'relative w-full overflow-hidden rounded',
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
      <p v-if="pendingImages" role="status" :class="['px-3 text-xs text-neutral-500']">
        {{ t('stage.chat.images.reading') }}
      </p>

      <div ref="voiceAttachment" :class="['px-2 pt-2 empty:hidden']" />

      <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple :class="['hidden']" @change="selectFiles">
      <BasicTextarea
        v-model="messageInput"
        :submit-on-enter="false"
        :placeholder="t('stage.message')"
        :class="[
          'max-h-[300px] min-h-[82px] w-full px-3 pb-12 pt-2.5 font-medium outline-none',
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

      <!-- The toolbar inside the composer, like the desktop app: add menu, recording status, microphone, and send. -->
      <div :class="['absolute inset-x-1.5 bottom-1.5 z-10 flex items-center gap-1.5']">
        <ChatComposerAddMenu :in-call="call.active" :recording="voiceRecording" :can-capture-screen="canCaptureScreen" @attach-images="imageInput?.click()" @capture-screen="handleCaptureScreen" @call="startVoiceCall" />
        <!-- The recording status and the walkie-talkie bar show here, so the composer keeps its height. -->
        <div ref="voiceStatus" data-testid="composer-voice-status" :class="['relative h-9 min-w-0 flex-1 rounded-full']" />
        <!-- A call listens already, so the microphone becomes the mute button of the call. -->
        <BasicButton
          v-if="call.active"
          size="unset"
          type="button"
          :aria-pressed="call.muted"
          :aria-label="t(call.muted ? 'stage.chat.call.unmute' : 'stage.chat.call.mute')"
          :title="t(call.muted ? 'stage.chat.call.unmute' : 'stage.chat.call.mute')"
          :class="[
            composerActionButtonClass,
            'shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500',
            call.muted
              ? 'bg-neutral-700 text-white dark:bg-white/20 dark:text-white'
              : 'text-neutral-500 hover:bg-neutral-900/8 dark:text-neutral-400 dark:hover:bg-white/10',
          ]"
          @click="call.toggleMuted()"
        >
          <span aria-hidden="true" :class="[call.muted ? 'i-mingcute:mic-off-line' : 'i-mingcute:mic-line', 'size-5']" />
        </BasicButton>
        <!-- The microphone stays mounted during a call, so a voice message that waits for the send button is kept. -->
        <ChatComposerVoiceInput
          ref="voiceButton"
          v-model="messageInput"
          :hidden="call.active"
          :surface="voiceStatus"
          :attachment-element="voiceAttachment"
          :session-id="chatSession.activeSessionId"
          :reply-to-message-id="replyTarget?.message.id"
          @recording-change="voiceRecording = $event"
          @pending-change="voicePending = $event"
          @sent="props.composer.clearReply()"
          @submit="handleSend"
          @configure="route => router.push(route)"
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
        <!-- Hover or right-click the send button to choose the send key. -->
        <ChatSendButton
          v-else
          v-model:send-mode="sendMode"
          :disabled="voiceRecording || !!pendingImages || (!messageInput.trim() && !attachments.length && !voicePending) || isComposing"
          :button-class="[composerActionButtonClass, 'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40']"
          @send="handleSend"
        />
      </div>
    </div>
  </div>
</template>
