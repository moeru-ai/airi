<script setup lang="ts">
import type { ChatHistoryReplyPayload, ChatImageAttachment } from '@proj-airi/stage-ui/components/scenarios/chat'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useThreeViewControl } from '@proj-airi/stage-ui-three'
import { CharacterSwitcherDrawer, ChatHistory } from '@proj-airi/stage-ui/components'
import { ChatImageAttachmentPreview, ChatReplyPreview, ChatSessionsDrawer, useChatComposer, useChatImages } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useAnalytics, useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { BasicButton, BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ViewControls from './InteractiveArea/Actions/ViewControls.vue'
import MobileSettingsDrawer from './mobile-settings-drawer.vue'
import MobileHeader from './MobileHeader.vue'

import { useChatInterruption } from '../../composables/use-chat-interruption'
import { useMobileInteractiveAreaLayout } from '../../composables/use-mobile-interactive-area-layout'
import { useTranscriptions } from '../../composables/use-transcriptions'
import { useChatToolCallRerun } from '../../composables/useChatToolCallRerun'
import { useStopSpeakingButton } from '../../composables/useStopSpeakingButton'

const emit = defineEmits<{
  /** Reports the stable height and offset that keep the Stage in the same screen position. */
  stageViewportChange: [viewport: { height: number, offsetTop: number }]
}>()

const chatOrchestrator = useChatStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const { activeSessionId, messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { activeSendSessionId, activeStreamingMessage, sending } = storeToRefs(chatOrchestrator)
const { isReceivingRemoteStream } = storeToRefs(useContextBridgeStore())
const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])
const isActiveSessionSending = computed(() => (
  (sending.value && activeSendSessionId.value === activeSessionId.value)
  || isReceivingRemoteStream.value
))
const visibleStreamingMessage = computed(() => activeSendSessionId.value === activeSessionId.value
  ? activeStreamingMessage.value
  : streamingMessage.value)
const { trackChatMessageDeleted } = useAnalytics()
const { rerunToolCall } = useChatToolCallRerun()
const composer = useChatComposer<ChatImageAttachment>({
  activeSessionId,
  send: submission => chatOrchestrator.send({
    sessionId: submission.sessionId,
    text: submission.text,
    attachments: submission.attachments.map(({ type, data, mimeType }) => ({ type, data, mimeType })),
    replyToMessageId: submission.replyToMessageId,
  }),
})
const {
  attachments,
  removeAttachment,
  clearReplyForMessage,
  draft: messageInput,
  isComposing,
  replyTarget,
  selectReply,
} = composer
const { addFiles, selectFiles, error: imageError, pending: pendingImages } = useChatImages(composer, () => activeSessionId.value)
const imageInput = useTemplateRef<HTMLInputElement>('imageInput')
const hasSubmission = computed(() => !!messageInput.value.trim() || attachments.value.length > 0)
const { showStopAction, stopActiveResponse, submitInterruptingResponse } = useChatInterruption({
  sessionId: activeSessionId,
  generating: isActiveSessionSending,
  hasSubmission,
  submit: async () => {
    await composer.submit()
  },
})

async function handleDeleteMessage(payload: { message: ChatHistoryItem, index: number }) {
  const { index, message } = payload
  await chatSession.deleteMessage({
    sessionId: activeSessionId.value,
    messageId: message?.id,
    index,
  })
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
  clearReplyForMessage(message)
}

const sessionsDrawerOpen = shallowRef(false)
const mobileInteractiveArea = useTemplateRef<HTMLElement>('mobileInteractiveArea')
const messageComposer = useTemplateRef<HTMLElement>('messageComposer')
const inputBubble = useTemplateRef<HTMLElement>('inputBubble')
const interactionControls = useTemplateRef<HTMLElement>('interactionControls')
const controlsIsland = useTemplateRef<HTMLElement>('controlsIsland')
const controlsIslandContent = useTemplateRef<HTMLElement>('controlsIslandContent')
const {
  chatHistoryStyle,
  controlsIslandOverflowing,
  controlsIslandStyle,
  messageComposerStyle,
  stableViewportHeight,
  viewportOffsetTop,
  viewportStyle: mobileInteractiveAreaStyle,
} = useMobileInteractiveAreaLayout({
  area: interactionControls,
  controlsIsland,
  controlsIslandContent,
  messageComposer,
  viewport: mobileInteractiveArea,
})

watch(
  [stableViewportHeight, viewportOffsetTop],
  ([height, offsetTop]) => emit('stageViewportChange', { height, offsetTop }),
  { immediate: true },
)

const mobileInteractiveAreaClass = [
  'pointer-events-none fixed inset-x-0 top-0 z-20 w-full',
  'flex flex-col',
]
const chatHistoryClass = [
  'pointer-events-auto relative z-20',
  'w-full self-start px-3 pb-3',
]
const controlsIslandClass = computed(() => [
  'absolute right-0 translate-y-[-100%]',
  'max-w-full overflow-y-auto overscroll-contain px-3 py-3 font-sans scrollbar-none',
  'transition-[height] duration-250 ease-out',
  controlsIslandOverflowing.value && [
    '[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_1rem,black_calc(100%_-_1rem),transparent_100%)]',
    '[mask-image:linear-gradient(to_bottom,transparent_0,black_1rem,black_calc(100%_-_1rem),transparent_100%)]',
    '[-webkit-mask-repeat:no-repeat] [mask-repeat:no-repeat]',
  ],
])
const { themeColorsHueDynamic } = storeToRefs(useSettings())
const { stageModelRenderer } = storeToRefs(useSettingsStageModel())
const l2dViewControl = useL2dViewControl()
const threeViewControl = useThreeViewControl()
const viewControlsAvailable = computed(() => stageModelRenderer.value === 'live2d' || stageModelRenderer.value === 'vrm')
const viewControlsEnabled = computed(() => {
  if (stageModelRenderer.value === 'live2d')
    return l2dViewControl.viewControlsEnabled.value
  if (stageModelRenderer.value === 'vrm')
    return threeViewControl.viewControlsEnabled.value
  return false
})
const settingsAudioDevice = useSettingsAudioDevice()
const { enabled, stream } = storeToRefs(settingsAudioDevice)
const { t } = useI18n()
const { audioContext } = useAudioContext()
const { startAnalyzer, stopAnalyzer } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

async function openViewControls() {
  closeViewControls()

  if (stageModelRenderer.value === 'live2d')
    l2dViewControl.viewControlsEnabled.value = true
  else if (stageModelRenderer.value === 'vrm')
    threeViewControl.viewControlsEnabled.value = true

  await nextTick()
  mobileInteractiveArea.value
    ?.querySelector<HTMLButtonElement>('[data-testid="view-controls-close-button"]')
    ?.focus()
}

function closeViewControls() {
  l2dViewControl.viewControlsEnabled.value = false
  threeViewControl.viewControlsEnabled.value = false
}

async function exitViewControls() {
  closeViewControls()
  await nextTick()
  mobileInteractiveArea.value
    ?.querySelector<HTMLButtonElement>('[data-testid="mobile-settings-button"]')
    ?.focus()
}

watch(stageModelRenderer, (renderer) => {
  const exitsViewControls = (renderer !== 'live2d' && l2dViewControl.viewControlsEnabled.value)
    || (renderer !== 'vrm' && threeViewControl.viewControlsEnabled.value)
  if (exitsViewControls) {
    void exitViewControls()
    return
  }

  if (renderer !== 'live2d')
    l2dViewControl.viewControlsEnabled.value = false
  if (renderer !== 'vrm')
    threeViewControl.viewControlsEnabled.value = false
}, { immediate: true })

function handleViewControlsKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !viewControlsEnabled.value)
    return

  event.preventDefault()
  void exitViewControls()
}

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

useTranscriptions(
  {
    messageInputRef: messageInput,
    sendMessage: handleSend,
    isStageTamagotchi,
  },
)
const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton()
const characterVoiceEnabled = computed({
  get: () => !speechMuted.value,
  set: (value) => {
    if (value === speechMuted.value)
      toggleSpeechMuted()
  },
})

async function handleReplyMessage(payload: ChatHistoryReplyPayload) {
  selectReply(payload)
  await nextTick()
  inputBubble.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}

async function handleCancelReply() {
  composer.clearReply()
  await nextTick()
  inputBubble.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}

async function handleSubmit() {
  if (!isMobileDevice()) {
    await handleSend()
  }
}

async function handleSend() {
  if (!pendingImages.value)
    await submitInterruptingResponse()
}

function teardownAnalyzer() {
  try {
    analyzerSource?.disconnect()
  }
  catch { }
  analyzerSource = undefined
  stopAnalyzer()
}

async function setupAnalyzer() {
  teardownAnalyzer()
  if (!enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
})
</script>

<template>
  <div
    ref="mobileInteractiveArea"
    data-testid="mobile-interactive-area"
    :class="mobileInteractiveAreaClass"
    :style="mobileInteractiveAreaStyle"
    @keydown="handleViewControlsKeydown"
  >
    <MobileHeader v-if="!viewControlsEnabled">
      <BasicButton
        size="unset"
        data-testid="conversation-selector-button"
        :class="[
          'pointer-events-auto size-11 shrink-0 rounded-full backdrop-blur-md',
          'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
          'focus-visible:outline-2 focus-visible:outline-primary-500',
        ]"
        :title="t('stage.chat.sessions.title')"
        :aria-label="t('stage.chat.sessions.title')"
        aria-haspopup="dialog"
        :aria-expanded="sessionsDrawerOpen"
        @click="sessionsDrawerOpen = true"
      >
        <span aria-hidden="true" :class="['i-solar:dialog-2-outline size-6']" />
      </BasicButton>
      <CharacterSwitcherDrawer />
      <MobileSettingsDrawer
        v-model:character-voice-enabled="characterVoiceEnabled"
        :view-controls-available="viewControlsAvailable"
        @open-view-controls="openViewControls"
      />
    </MobileHeader>
    <MobileHeader v-else>
      <BasicButton
        size="unset"
        data-testid="view-controls-close-button"
        :title="t('stage.mobile-tools.close-view')"
        :aria-label="t('stage.mobile-tools.close-view')"
        :class="[
          'pointer-events-auto ml-auto size-11 rounded-full backdrop-blur-md',
          'bg-neutral-50/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-300',
          'focus-visible:outline-2 focus-visible:outline-primary-500',
        ]"
        @click="exitViewControls"
      >
        <span aria-hidden="true" :class="['i-solar:close-circle-outline size-6']" />
      </BasicButton>
    </MobileHeader>
    <div
      :class="[
        'min-h-0 flex flex-1 flex-col justify-end overflow-hidden',
      ]"
    >
      <KeepAlive>
        <Transition name="fade">
          <ChatHistory
            v-if="!viewControlsEnabled"
            variant="mobile"
            :messages="historyMessages"
            :sending="isActiveSessionSending"
            :streaming-message="visibleStreamingMessage"
            class="chat-history"
            :style="chatHistoryStyle"
            :class="chatHistoryClass"
            @delete-message="handleDeleteMessage"
            @reply-message="handleReplyMessage"
            @tool-call-rerun="rerunToolCall"
          />
        </Transition>
      </KeepAlive>
    </div>
    <div
      v-show="!viewControlsEnabled"
      ref="interactionControls"
      data-testid="mobile-interaction-controls"
      :class="[
        'pointer-events-auto relative w-full shrink-0 self-end',
      ]"
    >
      <div translate-y="[-100%]" absolute left-0 px-3 pb-3 font-sans>
        <div flex="~ col" gap-1>
          <slot name="status" />
        </div>
      </div>
      <div
        ref="controlsIsland"
        data-testid="mobile-controls-island"
        :class="controlsIslandClass"
        :style="controlsIslandStyle"
      >
        <div
          ref="controlsIslandContent"
          :class="[
            'flex flex-col gap-1',
          ]"
        >
          <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
        </div>
      </div>
      <div
        ref="messageComposer"
        data-testid="mobile-message-composer"
        :class="[
          'max-h-100dvh max-w-100dvw w-full',
          'flex gap-2 px-3 pt-2',
        ]"
        :style="messageComposerStyle"
      >
        <button
          type="button"
          :aria-label="t('stage.chat.images.attach')"
          :class="[
            'size-10 shrink-0 flex items-center justify-center self-end rounded-full',
            'border-2 border-solid border-neutral-200/60 bg-neutral-100/80 text-primary-600 backdrop-blur-md',
            'dark:border-neutral-700/60 dark:bg-neutral-950/80 dark:text-primary-300',
            'transition-colors duration-200 hover:bg-primary-100/80 dark:hover:bg-primary-900/60 motion-reduce:transition-none',
          ]"
          @click="imageInput?.click()"
        >
          <span :class="['i-solar:paperclip-bold-duotone size-5']" />
        </button>
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple :class="['hidden']" @change="selectFiles">
        <div
          ref="inputBubble"
          data-testid="mobile-input-bubble"
          :class="[
            'relative min-h-10 min-w-0 flex flex-1 flex-col justify-center overflow-hidden rounded-[1lh]',
            'border-2 border-solid border-neutral-200/60 bg-neutral-100/80 backdrop-blur-md',
            'dark:border-neutral-700/60 dark:bg-neutral-950/80',
          ]"
        >
          <ChatReplyPreview
            :target="replyTarget"
            :class="['w-full']"
            @cancel="handleCancelReply"
          />
          <div v-if="attachments.length" :class="['flex gap-2 overflow-x-auto p-2']">
            <ChatImageAttachmentPreview v-for="(attachment, index) in attachments" :key="attachment.previewId" :file="attachment.file" @remove="removeAttachment(index)" />
          </div>
          <p v-if="imageError" role="alert" :class="['px-3 py-1 text-xs text-red-600 dark:text-red-400']">
            {{ imageError }}
          </p>
          <p v-if="pendingImages" role="status" :class="['px-3 py-1 text-xs text-neutral-500']">
            {{ t('stage.chat.images.reading') }}
          </p>
          <BasicTextarea
            v-model="messageInput"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            :spellcheck="false"
            :placeholder="t('stage.message')"
            :class="[
              'font-cute',
              'max-h-[10lh] min-h-[calc(1lh+4px+4px)] w-full resize-none overflow-y-scroll scrollbar-none',
              'border-2 border-solid border-transparent bg-transparent px-4 py-0.5 outline-none',
              'text-neutral-500 dark:text-neutral-100',
              'transition-colors duration-250 ease-in-out hover:text-neutral-600 dark:hover:text-neutral-200',
              'placeholder:text-[14px] placeholder:vertical-middle placeholder:leading-6 placeholder:text-neutral-400',
              'placeholder:transition-all placeholder:duration-250 placeholder:ease-in-out placeholder:hover:text-neutral-500 dark:placeholder:text-neutral-500 dark:placeholder:hover:text-neutral-400',
              themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : undefined,
            ]"
            default-height="1lh"
            @submit="handleSubmit"
            @paste-file="addFiles"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />
        </div>
        <div :class="['min-w-10 shrink-0 flex items-end justify-end gap-1']">
          <button
            v-if="showStopAction"
            data-testid="stop-speaking-button"
            :class="[
              'size-10 flex items-center justify-center rounded-full outline-none backdrop-blur-md',
              'border-2 border-solid border-neutral-200/60 bg-neutral-100/80',
              'text-lg text-neutral-500 transition-all duration-200 active:scale-95',
              'dark:border-neutral-700/60 dark:bg-neutral-950/80 dark:text-neutral-400',
              'hover:bg-primary-100/60 hover:text-primary-600 dark:hover:bg-primary-900/40 dark:hover:text-primary-300',
            ]"
            :title="t('stage.chat.actions.stop')"
            :aria-label="t('stage.chat.actions.stop')"
            @click="stopActiveResponse"
          >
            <div class="i-solar:stop-bold-duotone h-4 w-4" />
          </button>
          <button
            v-else-if="hasSubmission"
            :disabled="!!pendingImages"
            :aria-label="t('stage.chat.actions.send')"
            :class="[
              'size-10 flex items-center justify-center rounded-full bg-primary-500 text-white outline-none backdrop-blur-md',
              'transition-colors duration-200 hover:bg-primary-600 disabled:opacity-40 motion-reduce:transition-none',
            ]"
            @click="handleSend"
          >
            <div class="i-solar:arrow-up-outline size-5" />
          </button>
        </div>
      </div>
    </div>
    <div
      v-show="viewControlsEnabled"
      data-testid="view-controls-toolbar"
      :class="[
        'pointer-events-auto fixed inset-x-0 z-30',
        'pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
        'bottom-[max(1rem,env(safe-area-inset-bottom))]',
      ]"
    >
      <ViewControls variant="mobile-stage" />
    </div>
  </div>
</template>
