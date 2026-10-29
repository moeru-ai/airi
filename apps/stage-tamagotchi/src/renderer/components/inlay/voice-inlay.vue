<script setup lang="ts">
import type { VoicePresenceView } from '@proj-airi/stage-ui/components/scenarios/chat'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { VoicePresence } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useTimeoutFn } from '@vueuse/core'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronInlayReturnHome } from '../../../shared/eventa'
import { useChatFloatingClickThrough } from '../../composables/use-chat-floating-click-through'
import { useGlobalEscape } from '../../composables/use-global-escape'
import { useWindowBackdrop } from '../../composables/use-window-backdrop'

/**
 * Time without content before a dragged inlay returns to its home position.
 * The window paints nothing then, so the move is invisible, and the next capsule appears at home.
 */
const RETURN_HOME_DELAY_MS = 5000

const backdropRoot = useTemplateRef<HTMLElement>('backdrop-root')
useWindowBackdrop(backdropRoot, 'inlay')

const { t } = useI18n()
const presence = useTemplateRef<InstanceType<typeof VoicePresence>>('presence')
const returnHome = useElectronEventaInvoke(electronInlayReturnHome)
// The window stays above other apps, so only what the page paints takes the pointer.
const { hitTest } = useChatFloatingClickThrough({ pinned: true })

/** The view that `VoicePresence` paints. The window owns hit testing and its home position around it. */
const shown = shallowRef<VoicePresenceView>('hidden')

// Content that appears or moves under a still cursor changes what the cursor is over.
// The hit test treats zero opacity as unpainted, and a transition starts or ends at zero opacity.
// So `after-enter` runs it again once a card is visible, and `after-leave` once the card is gone.
watch(shown, () => nextTick(() => hitTest()), { flush: 'post' })

// Speech or a draft keeps the inlay where the user dragged it. Only an idle inlay returns home.
const homeTimer = useTimeoutFn(() => void returnHome(), RETURN_HOME_DELAY_MS, { immediate: false })
watch(shown, (value) => {
  if (value === 'hidden')
    homeTimer.start()
  else
    homeTimer.stop()
}, { immediate: true })

// Speech often starts while another app has focus, so Escape works from any app while the inlay shows speech.
// The focused inlay also handles Escape in `VoicePresence`. The second call for one press finds nothing to dismiss.
useGlobalEscape('voice-inlay-dismiss', () => shown.value === 'capsule' || shown.value === 'card', () => presence.value?.dismiss())
</script>

<template>
  <!-- The page anchors the inlay to the bottom edge. The space above it is room for the send animation. -->
  <main ref="backdrop-root" :class="['h-full w-full flex flex-col items-center justify-end px-4 pb-4', 'bg-transparent text-neutral-900 dark:text-neutral-100']">
    <VoicePresence
      ref="presence"
      data-testid="voice-inlay"
      data-window-backdrop-surface
      @shown-change="shown = $event"
      @after-enter="hitTest()"
      @after-leave="hitTest({ removed: true })"
    >
      <template #hint>
        <kbd
          :class="[
            'min-w-6 rounded-md border px-1.5 py-0.5 text-center font-sans text-[11px] leading-none',
            'border-neutral-900/15 bg-neutral-900/5 text-neutral-600',
            'dark:border-white/15 dark:bg-white/8 dark:text-neutral-300',
          ]"
        >esc</kbd>
        <span>{{ t('tamagotchi.stage.inlay.dismiss') }}</span>
      </template>
    </VoicePresence>
  </main>
</template>
