<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useThreeViewControl } from '@proj-airi/stage-ui-three'
import { ChatHistory, HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useAnalytics, useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, useTheme } from '@proj-airi/ui'
import { onLongPress } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import ViewControls from '../Layouts/InteractiveArea/Actions/ViewControls.vue'
import IndicatorMicVolume from '../Widgets/IndicatorMicVolume.vue'
import ActionAbout from './InteractiveArea/Actions/About.vue'

import { useMobileInteractiveAreaLayout } from '../../composables/use-mobile-interactive-area-layout'
import { useTranscriptions } from '../../composables/use-transcriptions'
import { useChatToolCallRerun } from '../../composables/useChatToolCallRerun'
import { useStopSpeakingButton } from '../../composables/useStopSpeakingButton'
import { BackgroundDialogPicker } from '../Backgrounds'

interface Props {
  /** Displays the message composer as a detached floating bubble. @default false */
  floating?: boolean
  /**
   * Enables keyboard measurement and limits the chat layer to the visible viewport.
   *
   * @default false
   */
  keyboardAvoidance?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  floating: false,
  keyboardAvoidance: false,
})
const emit = defineEmits<{
  /** Sends visualViewport.offsetTop so the parent can keep the Stage at the same screen position. */
  viewportOffsetChange: [offsetTop: number]
}>()

const { isDark, toggleDark } = useTheme()
const chatOrchestrator = useChatStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const { cleanupMessages } = useChatMaintenanceStore()
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
const { trackChatMessageDeleted, trackChatMessagesCleared } = useAnalytics()
const { rerunToolCall } = useChatToolCallRerun()

async function handleDeleteMessage(index: number) {
  const message = messages.value[index]
  await chatSession.deleteMessage({
    sessionId: activeSessionId.value,
    messageId: message?.id,
    index,
  })
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
}

function handleCleanupMessages() {
  const messageCount = messages.value.filter(message => message.role !== 'system').length
  cleanupMessages()
  trackChatMessagesCleared({
    source: 'chat_controls',
    message_count: messageCount,
  })
}

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const inputBubblePhase = shallowRef<'idle' | 'dragging' | 'docking' | 'docked'>('idle')
const inputBubbleOffsetX = shallowRef(0)
const inputBubbleOffsetY = shallowRef(0)
const inputBubbleMorphDuration = shallowRef(220)
const backgroundDialogOpen = shallowRef(false)
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
  viewportOffsetTop,
  viewportStyle: mobileInteractiveAreaStyle,
} = useMobileInteractiveAreaLayout({
  area: interactionControls,
  controlsIsland,
  controlsIslandContent,
  enabled: () => props.keyboardAvoidance,
  messageComposer,
  viewport: mobileInteractiveArea,
})

watch(viewportOffsetTop, offsetTop => emit('viewportOffsetChange', offsetTop), { immediate: true })

const mobileInteractiveAreaClass = computed(() => [
  'pointer-events-none fixed inset-x-0 z-20 w-full',
  'flex flex-col',
  props.keyboardAvoidance ? 'top-0' : 'bottom-0',
])
const chatHistoryClass = computed(() => [
  'pointer-events-auto relative z-20',
  'max-w-[calc(100%_-_3.5rem)] w-full self-start pb-3 pl-3',
  props.keyboardAvoidance ? undefined : 'max-h-[35dvh]',
])
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
const { viewControlsEnabled: l2dViewCtrlEnabled } = useL2dViewControl()
const { viewControlsEnabled: threeViewCtrlEnabled } = useThreeViewControl()
const settingsAudioDevice = useSettingsAudioDevice()
const { enabled, stream } = storeToRefs(settingsAudioDevice)
const { t } = useI18n()
const { audioContext } = useAudioContext()
const { startAnalyzer, stopAnalyzer } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

const { isListening, startStreamingTranscription, stopStreamingTranscription } = useTranscriptions(
  {
    messageInputRef: messageInput,
    sendMessage: handleSend,
    isStageTamagotchi,
  },
)
const { showStopSpeakingButton, speechMuted, stopSpeakingFromChat, toggleSpeechMuted } = useStopSpeakingButton()
const inputBubbleAvailable = computed(() => props.floating
  && !messageInput.value.trim()
  && !isComposing.value
  && !showStopSpeakingButton.value)
const inputBubbleDocked = computed(() => inputBubblePhase.value === 'docking'
  || inputBubblePhase.value === 'docked')
const inputBubbleTransitionClass = computed(() => {
  if (inputBubblePhase.value === 'dragging')
    return 'transition-none'
  if (inputBubblePhase.value === 'docking')
    return 'transition-[width,max-width,transform] ease-input-bubble-spring motion-reduce:transition-none'

  return 'transition-[width,max-width,transform] duration-320 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
})
const inputBubbleClass = computed(() => [
  'group relative mx-auto min-h-10 flex origin-center',
  inputBubbleTransitionClass.value,
  props.floating && !inputBubbleDocked.value && (inputBubbleAvailable.value ? 'max-w-[70%] focus-within:max-w-full' : 'max-w-full'),
  (inputBubbleAvailable.value || inputBubbleDocked.value) && 'touch-none select-none focus-within:touch-auto focus-within:select-text',
  inputBubbleDocked.value
    ? [
        'h-10 max-w-10 w-10 cursor-pointer rounded-xl border-2 border-solid backdrop-blur-md',
        'border-neutral-100/60 bg-neutral-50/70 dark:border-neutral-800/30 dark:bg-neutral-800/70',
      ]
    : 'w-full',
])
const inputBubbleMorphStyle = computed(() => inputBubblePhase.value === 'docking'
  ? { transitionDuration: `${inputBubbleMorphDuration.value}ms` }
  : undefined)
const inputBubbleStyle = computed(() => {
  if (!props.floating)
    return undefined

  const scale = inputBubblePhase.value === 'dragging' ? 0.98 : 1
  return {
    transform: `translate3d(${inputBubbleOffsetX.value}px, ${inputBubbleOffsetY.value}px, 0) scale(${scale})`,
    transitionDuration: inputBubbleMorphStyle.value?.transitionDuration,
  }
})
const toggleTranscription = () => isListening.value ? stopStreamingTranscription() : startStreamingTranscription()

let inputBubbleGesture: {
  pointerId: number
  startX: number
  startY: number
} | undefined
function focusMessageInput() {
  messageComposer.value?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
}

function resetInputBubble() {
  inputBubbleOffsetX.value = 0
  inputBubbleOffsetY.value = 0
  inputBubblePhase.value = 'idle'
}

function dockInputBubble() {
  const bubble = inputBubble.value
  const controls = controlsIslandContent.value
  const target = controls?.querySelector<HTMLElement>('button, a')
  if (!bubble || !controls || !target) {
    resetInputBubble()
    return
  }

  const bubbleRect = bubble.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const gap = Number.parseFloat(getComputedStyle(controls).rowGap) || 0
  const travelX = targetRect.left + targetRect.width / 2 - bubbleRect.left - bubbleRect.width / 2
  const travelY = targetRect.top - gap - targetRect.height / 2 - bubbleRect.top - bubbleRect.height / 2
  const targetX = inputBubbleOffsetX.value + travelX
  const targetY = inputBubbleOffsetY.value + travelY
  const distance = Math.hypot(travelX, travelY)
  const flightDuration = 500 + 40 * Math.sqrt(distance)

  inputBubbleOffsetX.value = targetX
  inputBubbleOffsetY.value = targetY
  inputBubbleMorphDuration.value = flightDuration
  inputBubblePhase.value = 'docking'
}

function handleInputBubbleTransitionEnd(event: TransitionEvent) {
  if (inputBubblePhase.value !== 'docking'
    || event.target !== event.currentTarget
    || event.propertyName !== 'transform') {
    return
  }

  inputBubblePhase.value = 'docked'
}

function canStartInputBubbleGesture() {
  return inputBubblePhase.value === 'idle'
    && inputBubbleAvailable.value
    && !inputBubble.value?.querySelector('textarea')?.matches(':focus')
}

onLongPress(inputBubble, () => {
  if (inputBubbleGesture && canStartInputBubbleGesture())
    inputBubblePhase.value = 'dragging'
}, { delay: 500, distanceThreshold: 10, modifiers: { prevent: true } })

function handleInputBubblePointer(event: PointerEvent) {
  if (event.type === 'pointerdown') {
    if (!canStartInputBubbleGesture() && !inputBubbleDocked.value)
      return

    event.preventDefault()
    if (event.isTrusted && event.currentTarget instanceof HTMLElement)
      event.currentTarget.setPointerCapture(event.pointerId)

    const gesture: NonNullable<typeof inputBubbleGesture> = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    inputBubbleGesture = gesture
    return
  }

  const gesture = inputBubbleGesture
  if (!gesture || gesture.pointerId !== event.pointerId)
    return

  const offsetX = event.clientX - gesture.startX
  const offsetY = event.clientY - gesture.startY
  if (event.type === 'pointermove') {
    if (inputBubblePhase.value === 'dragging') {
      inputBubbleOffsetX.value = offsetX
      inputBubbleOffsetY.value = offsetY
    }
    else if (Math.hypot(offsetX, offsetY) >= 10) {
      inputBubbleGesture = undefined
    }
    return
  }

  inputBubbleGesture = undefined
  if (event.type === 'pointercancel') {
    if (inputBubblePhase.value === 'dragging')
      resetInputBubble()
    return
  }
  if (inputBubbleDocked.value) {
    restoreInputBubble()
    return
  }
  if (inputBubblePhase.value !== 'dragging') {
    focusMessageInput()
    return
  }

  if (-offsetY >= 64 && -offsetY > Math.abs(offsetX))
    dockInputBubble()
  else
    resetInputBubble()
}

function restoreInputBubble() {
  resetInputBubble()
  setTimeout(focusMessageInput, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320)
}

async function handleSubmit() {
  if (!isMobileDevice()) {
    await handleSend()
  }
}

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const textToSend = messageInput.value
  const targetSessionId = chatSession.activeSessionId
  messageInput.value = ''

  try {
    await chatOrchestrator.send({
      sessionId: targetSessionId,
      text: textToSend,
    })
  }
  catch (error) {
    const errorMessage = errorMessageFrom(error) ?? String(error)
    const wasCancelledForDeletedSession
      = errorMessage.includes('Chat session was reset before send could start')
        || errorMessage.includes('Chat session was removed before send completed')
    if (!wasCancelledForDeletedSession && chatSession.activeSessionId === targetSessionId) {
      const currentDraft = messageInput.value
      messageInput.value = currentDraft ? `${textToSend}\n${currentDraft}` : textToSend
    }
  }
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
  >
    <BackgroundDialogPicker v-model="backgroundDialogOpen" class="pointer-events-auto" />
    <div
      :class="[
        'min-h-0 flex flex-1 flex-col justify-end overflow-hidden',
      ]"
    >
      <KeepAlive>
        <Transition name="fade">
          <ChatHistory
            v-if="!threeViewCtrlEnabled && !l2dViewCtrlEnabled"
            variant="mobile"
            :messages="historyMessages"
            :sending="isActiveSessionSending"
            :streaming-message="visibleStreamingMessage"
            class="chat-history"
            :style="chatHistoryStyle"
            :class="chatHistoryClass"
            @delete-message="handleDeleteMessage($event.index)"
            @tool-call-rerun="rerunToolCall"
          />
        </Transition>
      </KeepAlive>
    </div>
    <div
      ref="interactionControls"
      data-testid="mobile-interaction-controls"
      :class="[
        'pointer-events-auto relative w-full shrink-0 self-end',
        props.floating ? 'bg-transparent' : 'bg-white dark:bg-neutral-800',
      ]"
    >
      <div
        v-if="!props.floating"
        data-testid="mobile-composer-underlay"
        aria-hidden="true"
        :class="[
          'pointer-events-none absolute inset-x-0 top-full h-100dvh',
          'bg-white dark:bg-neutral-800',
        ]"
      />
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
          <ActionAbout />
          <div flex="~ col" items-end gap-1>
            <button
              data-testid="conversation-selector-button"
              border="2 solid neutral-100/60 dark:neutral-800/30"
              bg="neutral-50/70 dark:neutral-800/70"
              w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
              :title="t('stage.chat.sessions.title')"
              :aria-label="t('stage.chat.sessions.title')"
              @click="sessionsDrawerOpen = true"
            >
              <div i-solar:chat-line-bold-duotone size-5 text="neutral-500 dark:neutral-400" />
            </button>
            <button
              data-testid="speech-mute-button"
              :class="[
                'w-fit flex items-center self-end justify-center rounded-xl border-2 border-solid p-2 backdrop-blur-md',
                'border-neutral-100/60 text-neutral-500 transition-colors active:scale-95 dark:border-neutral-800/30 dark:text-neutral-400',
                speechMuted
                  ? 'bg-primary-100/80 text-primary-600 dark:bg-primary-900/60 dark:text-primary-300'
                  : 'bg-neutral-50/70 hover:text-primary-500 dark:bg-neutral-800/70 dark:hover:text-primary-400',
              ]"
              :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
              :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
              :aria-pressed="speechMuted"
              @click="toggleSpeechMuted"
            >
              <div v-if="speechMuted" class="i-solar:volume-cross-bold-duotone size-5" />
              <div v-else class="i-solar:volume-loud-bold-duotone size-5" />
            </button>
          </div>
          <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
          <HearingConfigDialog
            v-model:enabled="enabled"
            :transcription="isListening"
            :toggle-transcription="toggleTranscription"
            :granted="true"
          >
            <button
              border="2 solid neutral-100/60 dark:neutral-800/30"
              bg="neutral-50/70 dark:neutral-800/70"
              w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
              title="Hearing"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" size-5 :color-class="isListening ? undefined : 'text-neutral-500 dark:text-neutral-400'" />
                <div v-else i-solar:microphone-3-outline size-5 text="neutral-500 dark:neutral-400" />
              </Transition>
            </button>
          </HearingConfigDialog>
          <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Theme" @click="toggleDark()">
            <Transition name="fade" mode="out-in">
              <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-500 dark:neutral-400" />
              <div v-else i-solar:sun-2-outline size-5 text="neutral-500 dark:neutral-400" />
            </Transition>
          </button>
          <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Background" @click="backgroundDialogOpen = true">
            <div i-solar:gallery-wide-bold-duotone size-5 text="neutral-500 dark:neutral-400" />
          </button>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Language">
            <div i-solar:earth-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <RouterLink to="/settings" border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Settings">
            <div i-solar:settings-outline size-5 text="neutral-500 dark:neutral-400" />
          </RouterLink>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Model">
            <div i-solar:face-scan-circle-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Cleanup Messages"
            @click="handleCleanupMessages"
          >
            <div class="i-solar:trash-bin-2-bold-duotone" />
          </button>
          <ViewControls />
        </div>
      </div>
      <div
        ref="messageComposer"
        data-testid="mobile-message-composer"
        :class="[
          'max-h-100dvh max-w-100dvw w-full',
          'flex gap-1 px-3 pt-2',
          props.floating
            ? 'overflow-visible bg-transparent'
            : 'overflow-auto bg-white dark:bg-neutral-800',
        ]"
        :style="messageComposerStyle"
      >
        <div
          ref="inputBubble"
          data-testid="mobile-input-bubble"
          :class="inputBubbleClass"
          :style="inputBubbleStyle"
          @pointercancel="handleInputBubblePointer"
          @pointerdown="handleInputBubblePointer"
          @pointermove="handleInputBubblePointer"
          @pointerup="handleInputBubblePointer"
          @transitionend="handleInputBubbleTransitionEnd"
        >
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            :readonly="inputBubbleDocked"
            :class="[
              'font-cute',
              'max-h-[10lh] min-h-[calc(1lh+4px+4px)] w-full resize-none overflow-y-scroll scrollbar-none',
              'border-2 border-solid px-4 py-0.5 outline-none backdrop-blur-md',
              'text-neutral-500 dark:text-neutral-100',
              inputBubbleDocked
                ? 'opacity-0'
                : 'rounded-[1lh] border-neutral-200/60 bg-neutral-100/80 dark:border-neutral-700/60 dark:bg-neutral-950/80',
              'transition-all duration-250 ease-in-out hover:text-neutral-600 dark:hover:text-neutral-200',
              'placeholder:text-[14px] placeholder:vertical-middle placeholder:leading-6 placeholder:text-neutral-400',
              'placeholder:transition-all placeholder:duration-250 placeholder:ease-in-out placeholder:hover:text-neutral-500 dark:placeholder:text-neutral-500 dark:placeholder:hover:text-neutral-400',
              inputBubbleAvailable || inputBubbleDocked ? 'pointer-events-none group-focus-within:pointer-events-auto' : undefined,
              themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : undefined,
            ]"
            default-height="1lh"
            @submit="handleSubmit"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-500 transition-opacity duration-200 dark:text-neutral-400 motion-reduce:transition-none"
            :class="inputBubbleDocked ? 'opacity-100' : 'opacity-0'"
          >
            <div class="i-solar:keyboard-bold-duotone size-5" />
          </div>
        </div>
        <button
          v-if="showStopSpeakingButton"
          data-testid="stop-speaking-button"
          :class="[
            'h-[calc(1lh+4px+4px)] w-[calc(1lh+4px+4px)] flex items-center justify-center self-end rounded-md outline-none',
            'text-lg text-neutral-500 transition-all duration-200 active:scale-95 dark:text-neutral-400',
            'hover:bg-primary-100/60 hover:text-primary-600 dark:hover:bg-primary-900/40 dark:hover:text-primary-300',
          ]"
          title="Stop speaking"
          aria-label="Stop speaking"
          @click="stopSpeakingFromChat"
        >
          <div class="i-solar:stop-circle-bold-duotone h-5 w-5" />
        </button>
        <button
          v-if="messageInput.trim() || isComposing"
          w="[calc(1lh+4px+4px)]" h="[calc(1lh+4px+4px)]" aspect-square flex items-center self-end justify-center rounded-full outline-none backdrop-blur-md
          text="neutral-500 hover:neutral-600 dark:neutral-900 dark:hover:neutral-800"
          bg="primary-50/80 dark:neutral-100/80 hover:neutral-50"
          transition="all duration-250 ease-in-out"
          @click="handleSend"
        >
          <div i-solar:arrow-up-outline />
        </button>
      </div>
    </div>
  </div>
</template>
