<script setup lang="ts">
import type { ChatToolReference } from '../../../../types/chat'
import type { VoiceComposerMode } from '../composables/use-voice-composer'

import { BasicButton } from '@proj-airi/ui'
import { onLongPress, useElementBounding, useEventListener, useLocalStorage, useNow, useWindowSize } from '@vueuse/core'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useVoiceComposer } from '../composables/use-voice-composer'

const props = defineProps<{
  /**
   * `default` is 36px and matches the desktop send button. `large` is 40px and matches the mobile attachment and send buttons.
   * @default 'default'
   */
  size?: 'default' | 'large'
  /** The input surface. The recording bar covers it, and the backdrop leaves it uncovered. */
  inputElement: HTMLElement | null
  sessionId: string
  replyToMessageId?: string
  tools?: ChatToolReference[]
}>()
const emit = defineEmits<{
  /** The host started to send a voice message. */
  sent: []
  /** Recording UI opened or closed. The host hides its own input content while it is open. */
  recordingChange: [active: boolean]
  /** Dictation needs Hearing setup. The host opens Hearing settings in its own window or route. */
  configure: []
}>()
const draft = defineModel<string>({ required: true })
const { t } = useI18n()
const mode = useLocalStorage<VoiceComposerMode>('ui/chat/voice-mode', 'audio')
const button = useTemplateRef<InstanceType<typeof BasicButton>>('button')
const locked = shallowRef(false)
const cancelling = shallowRef(false)
const anchor = shallowRef({ x: 0, y: 0 })
const displacement = shallowRef({ x: 0, y: 0 })
const stoppedAt = shallowRef(0)
const inputCorners = shallowRef({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 })
const bounds = useElementBounding(() => props.inputElement)
let pointerId: number | undefined
let suppressClick = false

const voice = useVoiceComposer({
  sessionId: () => props.sessionId,
  replyToMessageId: () => props.replyToMessageId,
  tools: () => props.tools,
  onTranscript: (text) => {
    draft.value = [draft.value.trimEnd(), text].filter(Boolean).join(' ')
  },
  onSent: () => emit('sent'),
  onError: message => toast.error(t('stage.chat.voice-composer.failed'), { description: message }),
})
const { phase, transcript, level, startedAt, pending } = voice
const active = computed(() => phase.value !== 'idle')
/** The mode of the open recording. The stored preference can change only while no recording is open. */
const activeMode = computed(() => voice.mode.value ?? mode.value)
const now = useNow({ interval: 250 })
const { width: viewportWidth, height: viewportHeight } = useWindowSize()
const elapsed = computed(() => {
  if (!startedAt.value)
    return '0:00'
  const end = phase.value === 'processing' ? stoppedAt.value : now.value.getTime()
  const seconds = Math.max(0, Math.floor((end - startedAt.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
const icon = computed(() => activeMode.value === 'audio' ? 'i-solar:microphone-bold' : 'i-solar:text-field-focus-linear')
const cancelDistance = computed(() => Math.min(180, Math.max(110, bounds.width.value * 0.5)))
const cancelProgress = computed(() => Math.min(1, -displacement.value.x / cancelDistance.value))
const lockProgress = computed(() => Math.min(1, -displacement.value.y / 100))
const backdropStyle = computed(() => {
  const { left, top, right, bottom, width, height } = bounds
  const maxRadius = Math.min(width.value / 2, height.value / 2)
  const topLeft = Math.min(inputCorners.value.topLeft, maxRadius)
  const topRight = Math.min(inputCorners.value.topRight, maxRadius)
  const bottomRight = Math.min(inputCorners.value.bottomRight, maxRadius)
  const bottomLeft = Math.min(inputCorners.value.bottomLeft, maxRadius)
  // The backdrop follows the input's own rounded edge. A rectangular cutout
  // would expose bright background corners around an otherwise round input.
  const cutout = `M ${left.value + topLeft} ${top.value} H ${right.value - topRight} A ${topRight} ${topRight} 0 0 1 ${right.value} ${top.value + topRight} V ${bottom.value - bottomRight} A ${bottomRight} ${bottomRight} 0 0 1 ${right.value - bottomRight} ${bottom.value} H ${left.value + bottomLeft} A ${bottomLeft} ${bottomLeft} 0 0 1 ${left.value} ${bottom.value - bottomLeft} V ${top.value + topLeft} A ${topLeft} ${topLeft} 0 0 1 ${left.value + topLeft} ${top.value} Z`
  return { clipPath: `path(evenodd, "M 0 0 H ${viewportWidth.value} V ${viewportHeight.value} H 0 Z ${cutout}")` }
})
const buttonStyle = computed(() => ({
  left: `${anchor.value.x + displacement.value.x}px`,
  top: `${anchor.value.y + displacement.value.y}px`,
  transform: `translate(-50%, -50%) scale(${1 - cancelProgress.value * 0.65})`,
}))
// Level 1 (full scale) grows the halo by 60%, which stays inside the 10px halo margin plus the backdrop.
const haloStyle = computed(() => ({ transform: `scale(${1 + level.value * 0.6})` }))
const lockStyle = computed(() => ({
  left: `${Math.min(viewportWidth.value - 48, anchor.value.x - 22)}px`,
  top: `${anchor.value.y - 158}px`,
  height: `${84 - lockProgress.value * 40}px`,
  opacity: 1 - cancelProgress.value,
}))

/** Triggering workflow: BasicButton pointerdown -> capturePointer -> browser pointer capture for the entire hold. */
function capturePointer(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0 || active.value) {
    event.stopImmediatePropagation()
    return
  }
  const target = event.currentTarget
  if (!(target instanceof HTMLElement))
    return
  target.setPointerCapture(event.pointerId)
  pointerId = event.pointerId
  anchor.value = { x: event.clientX, y: event.clientY }
  locked.value = false
  cancelling.value = false
  displacement.value = { x: 0, y: 0 }
  suppressClick = false
}

/** Triggering workflow: onLongPress or Enter -> begin -> useVoiceComposer.start, after the Hearing check for dictation. */
function begin() {
  suppressClick = true
  if (mode.value === 'transcription' && !voice.transcriptionConfigured.value) {
    toast(t('stage.chat.voice-composer.configure-title'), {
      description: t('stage.chat.voice-composer.configure-description'),
      action: { label: t('stage.chat.voice-composer.configure-action'), onClick: () => emit('configure') },
    })
    return
  }
  bounds.update()
  if (props.inputElement) {
    const style = getComputedStyle(props.inputElement)
    inputCorners.value = {
      topLeft: Number.parseFloat(style.borderTopLeftRadius),
      topRight: Number.parseFloat(style.borderTopRightRadius),
      bottomRight: Number.parseFloat(style.borderBottomRightRadius),
      bottomLeft: Number.parseFloat(style.borderBottomLeftRadius),
    }
  }
  void voice.start(mode.value)
}

/** Triggering workflow: captured pointermove -> move -> cancel preview or latched recording lock. */
function move(event: PointerEvent) {
  if (event.pointerId !== pointerId || !active.value || locked.value || phase.value === 'processing')
    return
  const left = Math.max(0, anchor.value.x - event.clientX)
  const up = Math.max(0, anchor.value.y - event.clientY)
  // Follow the dominant axis. Horizontal movement shrinks toward cancellation;
  // vertical movement collapses the lock track until the lock latches.
  if (left >= up) {
    displacement.value = { x: -Math.min(left, cancelDistance.value), y: 0 }
    cancelling.value = left > cancelDistance.value * 0.55
    if (left >= cancelDistance.value)
      cancel()
  }
  else {
    displacement.value = { x: 0, y: -Math.min(up, 100) }
    cancelling.value = false
    if (up >= 100) {
      locked.value = true
      displacement.value = { x: 0, y: 0 }
    }
  }
}

/** Triggering workflow: window pointerup -> release -> discard or finish the owning pointer's recording. */
function release(event: PointerEvent) {
  // Other fingers cannot finish the hold owned by the captured pointer.
  if (event.pointerId !== pointerId)
    return
  pointerId = undefined
  if (!active.value || locked.value)
    return
  if (cancelling.value)
    void voice.cancel()
  else
    void voice.finish()
}

/** Triggering workflow: BasicButton click -> toggleMode -> persisted local input preference. */
function toggleMode() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (active.value)
    return
  mode.value = mode.value === 'audio' ? 'transcription' : 'audio'
}

/** Triggering workflow: pointercancel, Escape, or window blur -> cancel -> host discards the recording. */
function cancel() {
  pointerId = undefined
  suppressClick = true
  void voice.cancel()
}

/** Triggering workflow: BasicButton Enter -> keyboardRecord -> locked start or explicit finish. */
function keyboardRecord(event: KeyboardEvent) {
  if (event.repeat)
    return
  if (active.value) {
    void voice.finish()
    return
  }
  const rect = button.value?.$el.getBoundingClientRect()
  if (rect)
    anchor.value = { x: rect.right - rect.width / 2, y: rect.top + rect.height / 2 }
  locked.value = true
  begin()
}

onLongPress(button, () => {
  if (pointerId !== undefined)
    begin()
}, { delay: 300, distanceThreshold: false })
// onLongPress also reports pointerleave through onMouseUp. Leaving the original
// button during a drag is not release; only the owning pointerup finishes it.
useEventListener(window, 'pointerup', release, { capture: true })
useEventListener(window, 'keydown', (event) => {
  if (event.key === 'Escape' && active.value)
    cancel()
})
useEventListener(window, 'blur', () => {
  if (active.value && phase.value !== 'processing')
    cancel()
})
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden && active.value)
    cancel()
})

watch(phase, (value) => {
  if (value === 'processing')
    stoppedAt.value = Date.now()
})

watch(active, (value) => {
  emit('recordingChange', value)
  if (!value) {
    locked.value = false
    cancelling.value = false
  }
})

onBeforeUnmount(() => {
  emit('recordingChange', false)
})
</script>

<template>
  <div v-if="pending.length" :class="['flex shrink-0 items-center gap-1']">
    <BasicButton
      data-testid="voice-retry-send"
      size="unset"
      type="button"
      :aria-label="t('stage.chat.voice-composer.retry')"
      :title="pending[0].error"
      :class="['size-10 rounded-full bg-primary-100/90 text-primary-600 dark:bg-primary-900/90 dark:text-primary-200']"
      @click="voice.send(pending[0].id)"
    >
      <span :class="['i-solar:refresh-linear size-5']" aria-hidden="true" />
    </BasicButton>
    <BasicButton
      data-testid="voice-discard-send"
      size="unset"
      type="button"
      :aria-label="t('stage.chat.voice-composer.discard')"
      :title="t('stage.chat.voice-composer.discard')"
      :class="['size-10 rounded-full text-neutral-500 dark:text-neutral-300']"
      @click="voice.discard(pending[0].id)"
    >
      <span :class="['i-solar:close-circle-linear size-5']" aria-hidden="true" />
    </BasicButton>
  </div>
  <BasicButton
    v-else
    ref="button"
    size="unset"
    type="button"
    data-testid="voice-composer-button"
    :disabled="!voice.available.value"
    :aria-label="t(`stage.chat.voice-composer.${mode}`)"
    :title="`${t(`stage.chat.voice-composer.${mode}`)} · ${t('stage.chat.voice-composer.hold-hint')}`"
    :style="{ pointerEvents: active ? 'none' : undefined }"
    :class="[
      size === 'large' ? 'size-10' : 'size-9',
      'shrink-0 touch-none select-none self-end rounded-full outline-none',
      'bg-primary-100/90 text-primary-600 dark:bg-primary-900/90 dark:text-primary-200',
      'hover:bg-primary-200/90 dark:hover:bg-primary-800/90',
      'focus-visible:ring-2 focus-visible:ring-primary-500',
      active && 'opacity-0',
    ]"
    @pointerdown="capturePointer"
    @pointermove="move"
    @pointercancel="cancel"
    @contextmenu.prevent
    @click="toggleMode"
    @keydown.enter.prevent.stop="keyboardRecord"
  >
    <span :class="[icon, 'size-5']" aria-hidden="true" />
  </BasicButton>
  <Teleport v-if="active && inputElement" :to="inputElement">
    <div
      data-testid="voice-recording-bar"
      :class="['absolute inset-0 z-20 flex items-center gap-3 px-4 text-neutral-500 dark:text-neutral-100']"
    >
      <span :class="['size-2 shrink-0 rounded-full bg-red-500', phase === 'recording' && 'animate-pulse']" />
      <span data-testid="voice-recording-time" :class="['shrink-0 text-sm font-medium tabular-nums']">{{ elapsed }}</span>
      <span v-if="phase === 'processing'" :class="['flex-1 truncate text-center text-sm opacity-70']">{{ t('stage.chat.voice-composer.processing') }}</span>
      <BasicButton v-else-if="locked" :class="['mx-auto rounded-full px-3 py-2 text-sm text-red-500']" @click="cancel">
        {{ t('stage.chat.voice-composer.cancel') }}
      </BasicButton>
      <span v-else :class="['pointer-events-none flex flex-1 items-center justify-center gap-1 text-xs']" :style="{ opacity: 1 - cancelProgress, transform: `translateX(${displacement.x * 0.4}px)` }">
        <span :class="['i-solar:alt-arrow-left-linear size-4 shrink-0']" />
        {{ t('stage.chat.voice-composer.cancel-hint') }}
      </span>
      <BasicButton v-if="phase === 'processing'" :aria-label="t('stage.chat.voice-composer.cancel')" :class="['ml-auto size-10 shrink-0 rounded-full text-red-500']" @click="cancel">
        <span :class="['i-solar:close-circle-linear size-6']" />
      </BasicButton>
    </div>
  </Teleport>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="active" data-testid="voice-composer-overlay" :data-phase="phase" :data-locked="locked" :data-cancelling="cancelling" :class="['pointer-events-none fixed inset-0 z-[1000] touch-none select-none font-sans']">
        <div data-testid="voice-backdrop" :class="['pointer-events-auto absolute inset-0 bg-black/55 backdrop-blur-sm']" :style="backdropStyle" @click="cancel" />
        <div
          v-if="activeMode === 'transcription'"
          data-testid="voice-transcript"
          :class="[
            'pointer-events-auto absolute inset-x-4 top-[max(2rem,env(safe-area-inset-top))] mx-auto max-h-[36dvh] min-h-28 max-w-xl overflow-y-auto rounded-3xl p-4',
            'bg-white/95 text-neutral-800 shadow-xl dark:bg-neutral-900/95 dark:text-neutral-100',
          ]"
        >
          <div :class="['mb-3 text-xs text-primary-500 font-semibold tracking-wide']">
            {{ t('stage.chat.voice-composer.transcription') }}
          </div>
          <p aria-live="polite" :class="['whitespace-pre-wrap text-lg leading-relaxed']">
            {{ transcript || t('stage.chat.voice-composer.listening') }}
          </p>
        </div>
        <div
          v-if="!locked && phase !== 'processing'"
          data-testid="voice-lock-track"
          :class="['pointer-events-none fixed w-11 flex flex-col items-center justify-between rounded-full bg-neutral-100 py-3 text-neutral-700 shadow-md dark:bg-neutral-800 dark:text-neutral-100']"
          :style="lockStyle"
          :aria-label="t('stage.chat.voice-composer.lock')"
        >
          <span :class="['i-solar:lock-keyhole-linear size-5 shrink-0']" />
          <span :class="['i-solar:alt-arrow-up-linear size-4 shrink-0']" :style="{ opacity: 1 - lockProgress }" />
        </div>
        <div
          v-if="phase !== 'processing'"
          data-testid="voice-floating-button"
          :class="['pointer-events-auto fixed size-20', locked && 'transition-[left,top,transform] duration-200 ease-out motion-reduce:transition-none']"
          :style="buttonStyle"
        >
          <div
            data-testid="voice-volume-halo"
            :class="['pointer-events-none absolute inset-[-10px] rounded-full bg-primary-400/35 transition-transform duration-100 motion-reduce:transition-none']"
            :style="haloStyle"
          />
          <BasicButton
            :aria-label="t(activeMode === 'audio' ? 'stage.chat.voice-composer.send' : 'stage.chat.voice-composer.insert')"
            :aria-disabled="!locked"
            :tabindex="locked ? 0 : -1"
            :class="['relative size-full flex items-center justify-center rounded-full bg-primary-500 text-white shadow-lg', !locked && 'pointer-events-none']"
            @click="locked && voice.finish()"
          >
            <span :class="[phase === 'starting' ? 'i-svg-spinners:ring-resize' : locked ? 'i-solar:arrow-up-linear' : icon, 'size-8']" />
          </BasicButton>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
