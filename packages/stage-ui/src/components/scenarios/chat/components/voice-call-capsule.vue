<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import VoiceWaveform from './voice-waveform.vue'

import { useSpeakingStore } from '../../../../stores/audio'
import { useVoiceCallStore } from '../../../../stores/voice-call'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { useCallDuration } from '../composables/use-call-duration'

const props = withDefaults(defineProps<{
  /**
   * Where the capsule sits. `page-top` is the top edge of the page. `below-header` is below the 44px buttons of the
   * touch layout header, so the capsule never covers the character name in the middle.
   * @default 'page-top'
   */
  placement?: 'page-top' | 'below-header'
}>(), { placement: 'page-top' })

/**
 * The call UI of a voice call: a capsule at the top of the page for the whole call.
 * Only the hang-up button ends the call, so a stray tap on the body never does. The composer owns the mute button.
 */
const { t } = useI18n()
const call = useVoiceCallStore()
const controls = useVoiceControlsStore()
const speaking = useSpeakingStore()
const duration = useCallDuration()

/**
 * The waveform follows whoever speaks: the microphone level while the user speaks, or the mouth opening of the character
 * while it speaks. The host publishes the microphone level only while it captures speech, so silence draws dots.
 */
const level = computed(() => call.muted ? speaking.mouthOpenSize : Math.max(controls.level, speaking.mouthOpenSize))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      enter-from-class="opacity-0 -translate-y-2 scale-90"
      leave-to-class="opacity-0 -translate-y-2 scale-90"
    >
      <div
        v-if="call.active"
        data-testid="voice-call-capsule"
        :class="[
          'fixed left-1/2 z-40 -translate-x-1/2',
          props.placement === 'below-header' ? 'top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]' : 'top-[max(0.75rem,env(safe-area-inset-top))]',
          'h-8 w-40 flex items-center overflow-hidden rounded-full p-0.5 shadow-md backdrop-blur-md',
          'bg-neutral-900/85 text-neutral-200 dark:bg-neutral-800/90',
        ]"
      >
        <!--
          The newest bar is next to the hang-up button and older bars move right and fade out, so the waveform reads as
          sound that leaves the call.
        -->
        <div
          aria-hidden="true"
          :class="[
            'pointer-events-none absolute inset-y-0 left-8 right-10 flex items-center text-neutral-400',
            '[mask-image:linear-gradient(to_left,transparent,black_70%)] [-webkit-mask-image:linear-gradient(to_left,transparent,black_70%)]',
          ]"
        >
          <VoiceWaveform :level="level" :active="true" :class="['-scale-x-100']" />
        </div>
        <BasicButton
          size="unset"
          type="button"
          data-testid="voice-call-capsule-hang-up"
          :aria-label="t('stage.chat.call.hang-up')"
          :title="t('stage.chat.call.hang-up')"
          :class="[
            'relative z-1 size-7 shrink-0 flex items-center justify-center rounded-full outline-none',
            'text-red-500 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-red-400',
            'transition-colors duration-150 motion-reduce:transition-none',
          ]"
          @click="call.hangUp()"
        >
          <!-- The handset turned to face down is the common hang-up sign. -->
          <span aria-hidden="true" :class="['i-mingcute:phone-fill size-4.5 rotate-[135deg]']" />
        </BasicButton>
        <span
          role="timer"
          data-testid="voice-call-capsule-duration"
          :class="['pointer-events-none relative ml-auto pr-2.5 text-xs tabular-nums']"
        >{{ duration }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
