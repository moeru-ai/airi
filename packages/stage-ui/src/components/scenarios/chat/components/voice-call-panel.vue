<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSpeakingStore } from '../../../../stores/audio'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useVoiceCallStore } from '../../../../stores/voice-call'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { useCallDuration } from '../composables/use-call-duration'

/** A drag down on the handle this far minimizes the call to the status capsule. */
const MINIMIZE_DRAG_PX = 48

const { t } = useI18n()
const call = useVoiceCallStore()
const controls = useVoiceControlsStore()
const speaking = useSpeakingStore()
const cards = useAiriCardStore()
const duration = useCallDuration()

const name = computed(() => cards.activeCard?.name)
/** The status says who has the turn: the muted user, the speaking character, or the listening character. */
const status = computed(() => {
  if (call.muted)
    return t('stage.chat.call.muted')
  if (speaking.nowSpeaking)
    return t('stage.chat.call.speaking')
  if (controls.snapshot.input?.phase === 'capturing')
    return t('stage.chat.call.hearing')
  return t('stage.chat.call.listening')
})

/**
 * The handle minimizes the call. A tap minimizes at once. A drag moves the panel with the pointer, and a release past
 * the threshold minimizes. A shorter drag returns the panel.
 */
const drag = shallowRef<{ pointerId: number, startY: number, offset: number }>()
let dragged = false

function dragStart(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return
  const target = event.currentTarget
  if (target instanceof HTMLElement && target.isConnected)
    target.setPointerCapture?.(event.pointerId)
  dragged = false
  drag.value = { pointerId: event.pointerId, startY: event.clientY, offset: 0 }
}

function dragMove(event: PointerEvent) {
  const current = drag.value
  if (event.pointerId !== current?.pointerId)
    return
  // Only a downward drag moves the panel. An upward drag keeps it in place.
  const offset = Math.max(0, event.clientY - current.startY)
  dragged ||= offset > 4
  drag.value = { ...current, offset }
}

function dragEnd(event: PointerEvent) {
  const current = drag.value
  if (event.pointerId !== current?.pointerId)
    return
  drag.value = undefined
  if (current.offset >= MINIMIZE_DRAG_PX)
    call.minimize()
}

function handleClick() {
  // A drag that ended short of the threshold also clicks. Only a tap minimizes.
  if (!dragged)
    call.minimize()
  dragged = false
}

const controlButtonClasses = [
  'size-14 shrink-0 flex items-center justify-center rounded-full outline-none shadow-md backdrop-blur-md',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
  'transition-colors duration-150 motion-reduce:transition-none',
]
const quietSurfaceClasses = 'bg-neutral-50/80 text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800/80 dark:text-neutral-100 dark:hover:bg-neutral-700/80'
/** A muted microphone inverts its button, so the state reads at a glance. */
const mutedSurfaceClasses = 'bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white'
</script>

<template>
  <section
    data-testid="voice-call-panel"
    :aria-label="t('stage.chat.call.title')"
    :style="drag ? { transform: `translateY(${drag.offset}px)` } : undefined"
    :class="[
      'relative w-full flex flex-col gap-3 px-3 pb-2',
      !drag && 'transition-transform duration-200 ease-out motion-reduce:transition-none',
    ]"
  >
    <button
      type="button"
      data-testid="voice-call-minimize"
      :aria-label="t('stage.chat.call.minimize')"
      :title="t('stage.chat.call.minimize')"
      :class="[
        'mx-auto h-5 w-16 flex cursor-grab touch-none select-none items-center justify-center rounded-full outline-none',
        'focus-visible:outline-2 focus-visible:outline-primary-500',
        drag && 'cursor-grabbing',
      ]"
      @pointerdown="dragStart"
      @pointermove="dragMove"
      @pointerup="dragEnd"
      @pointercancel="drag = undefined"
      @click="handleClick"
    >
      <span aria-hidden="true" :class="['h-1 w-9 rounded-full', 'bg-neutral-900/20 dark:bg-white/25']" />
    </button>
    <div :class="['min-w-0 flex flex-col items-center text-center']">
      <span :class="['max-w-full truncate text-base font-semibold text-neutral-800 dark:text-neutral-100']">
        {{ name ?? t('stage.chat.call.title') }}
      </span>
      <span role="status" :class="['flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400']">
        <span data-testid="voice-call-status">{{ status }}</span>
        <span aria-hidden="true">·</span>
        <span data-testid="voice-call-duration" :class="['tabular-nums']">{{ duration }}</span>
      </span>
    </div>
    <div :class="['relative min-h-0 flex flex-col items-center']">
      <!-- The call content between the header and the controls, such as the live transcript. -->
      <slot />
    </div>
    <div :class="['relative flex items-center justify-between']">
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-call-hang-up"
        :aria-label="t('stage.chat.call.hang-up')"
        :title="t('stage.chat.call.hang-up')"
        :class="[controlButtonClasses, quietSurfaceClasses]"
        @click="call.hangUp()"
      >
        <!-- The handset turned to face down is the common hang-up sign. -->
        <span aria-hidden="true" :class="['i-mingcute:phone-fill size-6 rotate-[135deg]']" />
      </BasicButton>
      <BasicButton
        size="unset"
        type="button"
        data-testid="voice-call-mute"
        :aria-pressed="call.muted"
        :aria-label="t(call.muted ? 'stage.chat.call.unmute' : 'stage.chat.call.mute')"
        :title="t(call.muted ? 'stage.chat.call.unmute' : 'stage.chat.call.mute')"
        :class="[controlButtonClasses, call.muted ? mutedSurfaceClasses : quietSurfaceClasses]"
        @click="call.toggleMuted()"
      >
        <span aria-hidden="true" :class="[call.muted ? 'i-mingcute:mic-off-line' : 'i-mingcute:mic-line', 'size-6']" />
      </BasicButton>
    </div>
  </section>
</template>
