<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useThreeViewControl } from '@proj-airi/stage-ui-three'
import { CharacterSwitcherDrawer, ChatHistory } from '@proj-airi/stage-ui/components'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components/scenarios/chat'
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
import { onLongPress, useEventListener, usePointerSwipe } from '@vueuse/core'
import { animate, spring } from 'animejs'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ViewControls from './InteractiveArea/Actions/ViewControls.vue'
import MobileSettingsDrawer from './mobile-settings-drawer.vue'
import MobileHeader from './MobileHeader.vue'

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

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const inputBubbleDocked = shallowRef(false)
const inputBubbleDragging = shallowRef(false)
const inputBubbleAnimating = shallowRef(false)
const sessionsDrawerOpen = shallowRef(false)
const mobileInteractiveArea = useTemplateRef<HTMLElement>('mobileInteractiveArea')
const messageComposer = useTemplateRef<HTMLElement>('messageComposer')
const inputBubble = useTemplateRef<HTMLElement>('inputBubble')
const inputBubbleDockTarget = useTemplateRef<HTMLElement>('inputBubbleDockTarget')
const inputBubbleIcon = useTemplateRef<HTMLElement>('inputBubbleIcon')
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

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent)
}

const messageInputPointerEventsClass = computed(() => {
  if (inputBubbleDocked.value)
    return 'pointer-events-none'

  if (isAndroidDevice())
    return 'pointer-events-none group-focus-within:pointer-events-auto'

  return 'pointer-events-auto'
})

useTranscriptions(
  {
    messageInputRef: messageInput,
    sendMessage: handleSend,
    isStageTamagotchi,
  },
)
const { showStopSpeakingButton, speechMuted, stopSpeakingFromChat, toggleSpeechMuted } = useStopSpeakingButton()
const characterVoiceEnabled = computed({
  get: () => !speechMuted.value,
  set: (value) => {
    if (value === speechMuted.value)
      toggleSpeechMuted()
  },
})

let suppressNextInputBubbleClick = false

async function resetInputBubblePosition() {
  await animate(inputBubble.value!, {
    transform: 'translate3d(0px, 0px, 0px) scale(1)',
    ease: spring({ bounce: 0.3, duration: 320 }),
  })
}

async function setInputBubbleDocked(docked: boolean) {
  if (inputBubbleDocked.value === docked)
    return

  inputBubbleAnimating.value = true
  const bubble = inputBubble.value!
  const source = bubble.getBoundingClientRect()
  bubble.style.transform = 'translate3d(0px, 0px, 0px) scale(1)'
  if (!docked) {
    bubble.style.removeProperty('width')
    bubble.style.removeProperty('max-width')
    bubble.style.removeProperty('height')
  }
  inputBubbleDocked.value = docked
  await nextTick()

  const destination = bubble.getBoundingClientRect()
  const target = docked ? inputBubbleDockTarget.value!.getBoundingClientRect() : destination
  const startX = source.left + source.width / 2 - destination.left - destination.width / 2
  const startY = source.top - destination.top
  const endX = target.left + target.width / 2 - destination.left - destination.width / 2
  const endY = target.top + target.height / 2 - destination.top - destination.height / 2
  const messageInput = bubble.querySelector<HTMLTextAreaElement>('textarea')!

  await Promise.all([
    animate(bubble, {
      width: [`${source.width}px`, `${target.width}px`],
      maxWidth: [`${source.width}px`, `${target.width}px`],
      height: [`${source.height}px`, `${target.height}px`],
      transform: [
        `translate3d(${startX}px, ${startY}px, 0)`,
        `translate3d(${endX}px, ${endY}px, 0)`,
      ],
      ease: spring({ bounce: docked ? 0.35 : 0.25, duration: 400 }),
    }),
    animate(messageInput, {
      opacity: docked ? 0 : 1,
      duration: 120,
      ease: 'out(2)',
    }),
    animate(inputBubbleIcon.value!, {
      opacity: docked ? 1 : 0,
      duration: 120,
      ease: 'out(2)',
    }),
  ])

  if (!docked) {
    bubble.style.removeProperty('width')
    bubble.style.removeProperty('max-width')
    bubble.style.removeProperty('height')
  }
  inputBubbleAnimating.value = false
  await nextTick()
}

const {
  distanceX: inputBubbleDistanceX,
  distanceY: inputBubbleDistanceY,
} = usePointerSwipe(inputBubble, {
  threshold: 0,
  onSwipe: handleInputBubbleSwipe,
  onSwipeEnd: finishInputBubbleDrag,
})

async function finishInputBubbleDrag() {
  if (!inputBubbleDragging.value)
    return

  inputBubbleDragging.value = false
  const upwardDistance = inputBubbleDistanceY.value
  const draggedTowardDock = upwardDistance >= 64
    && upwardDistance > Math.abs(inputBubbleDistanceX.value)
  if (draggedTowardDock)
    await setInputBubbleDocked(true)
  else
    await resetInputBubblePosition()
}

function handleInputBubbleSwipe() {
  if (!inputBubbleDragging.value)
    return

  inputBubble.value!.style.transform = `translate3d(${-inputBubbleDistanceX.value}px, ${-inputBubbleDistanceY.value}px, 0) scale(.98)`
}

function handleInputBubbleLongPress() {
  if (inputBubbleDocked.value)
    return

  suppressNextInputBubbleClick = true
  inputBubbleDragging.value = true
  inputBubble.value!.querySelector<HTMLTextAreaElement>('textarea')!.blur()
  inputBubble.value!.style.transform = 'translate3d(0, 0, 0) scale(.98)'
}

function handleInputBubblePointerDown(event: PointerEvent) {
  suppressNextInputBubbleClick = false

  const messageInput = inputBubble.value!.querySelector<HTMLTextAreaElement>('textarea')!

  // NOTICE:
  // The focused textarea must suppress native text selection before a dock drag starts.
  // A blurred textarea must keep native activation so Safari can cancel an active keyboard dismissal.
  // See the closing-focus regression in adaptive-input.test.ts.
  // Remove this branch when Safari exposes a keyboard lifecycle that can cancel an active dismissal.
  if (document.activeElement === messageInput)
    event.preventDefault()
}

function handleInputBubbleContextMenu(event: MouseEvent) {
  if (isAndroidDevice())
    event.preventDefault()
}

onLongPress(inputBubble, handleInputBubbleLongPress, {
  delay: 500,
  distanceThreshold: 10,
  onMouseUp: (_duration, _distance, longPressed) => longPressed && finishInputBubbleDrag(),
})

async function handleInputBubbleClick() {
  if (suppressNextInputBubbleClick) {
    suppressNextInputBubbleClick = false
    return
  }

  if (inputBubbleDocked.value) {
    await setInputBubbleDocked(false)
    return
  }

  inputBubble.value!.querySelector<HTMLTextAreaElement>('textarea')!.focus()
}

async function handleInputBubblePointerCancel() {
  inputBubbleDragging.value = false
  await resetInputBubblePosition()
}

useEventListener(inputBubble, 'pointercancel', handleInputBubblePointerCancel)

onMounted(() => {
  inputBubble.value!.style.setProperty('touch-action', 'none')
})

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
            @delete-message="handleDeleteMessage($event.index)"
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
          <div
            ref="inputBubbleDockTarget"
            data-testid="mobile-input-bubble-dock-target"
            class="invisible size-10 shrink-0 self-end"
          />
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
        <div
          ref="inputBubble"
          data-testid="mobile-input-bubble"
          :data-dragging="inputBubbleDragging"
          :class="[
            'group relative mx-auto min-h-10 flex items-end origin-center',
            'touch-none select-none focus-within:touch-auto focus-within:select-text',
            inputBubbleDragging || inputBubbleAnimating
              ? 'transition-none'
              : 'transition-[max-width] duration-320 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            inputBubbleDocked
              ? [
                'h-10 max-w-10 w-10 cursor-pointer rounded-xl border-2 border-solid backdrop-blur-md',
                'border-neutral-100/60 bg-neutral-50/70 dark:border-neutral-800/30 dark:bg-neutral-800/70',
              ]
              : 'max-w-[70%] w-full focus-within:max-w-full',
          ]"
          @click="handleInputBubbleClick"
          @contextmenu="handleInputBubbleContextMenu"
          @pointerdown="handleInputBubblePointerDown"
        >
          <!-- Android handles touch from the scrollable textarea, so it needs touch-none to keep the bubble drag active. -->
          <BasicTextarea
            v-model="messageInput"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            :spellcheck="false"
            :placeholder="t('stage.message')"
            :class="[
              'font-cute',
              'max-h-[10lh] min-h-[calc(1lh+4px+4px)] w-full touch-none resize-none overflow-y-scroll scrollbar-none',
              'border-2 border-solid px-4 py-0.5 outline-none backdrop-blur-md',
              'text-neutral-500 dark:text-neutral-100',
              'rounded-[1lh] border-neutral-200/60 bg-neutral-100/80 dark:border-neutral-700/60 dark:bg-neutral-950/80',
              'transition-colors duration-250 ease-in-out hover:text-neutral-600 dark:hover:text-neutral-200',
              'placeholder:text-[14px] placeholder:vertical-middle placeholder:leading-6 placeholder:text-neutral-400',
              'placeholder:transition-all placeholder:duration-250 placeholder:ease-in-out placeholder:hover:text-neutral-500 dark:placeholder:text-neutral-500 dark:placeholder:hover:text-neutral-400',
              messageInputPointerEventsClass,
              themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : undefined,
            ]"
            default-height="1lh"
            @submit="handleSubmit"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />
          <div
            ref="inputBubbleIcon"
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-500 opacity-0 dark:text-neutral-400"
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
