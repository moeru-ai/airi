<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { VoiceDrafts } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { electronInlayHide } from '../../../shared/eventa'

/**
 * How long an emptied inlay stays visible before it hides.
 * Continuous speech often sends one draft and starts the next within this time, so the window does not flicker.
 */
const EMPTY_HIDE_DELAY_MS = 1200

const { t } = useI18n()
const hideInlay = useElectronEventaInvoke(electronInlayHide)
const emptyHide = useTimeoutFn(() => void hideInlay(), EMPTY_HIDE_DELAY_MS, { immediate: false })
let shown = false

/**
 * Hides the window after its content goes away, for example after a send or a discard.
 * An inlay that opens empty, such as from the tray menu, stays open.
 */
function handlePresence(visible: boolean) {
  if (visible)
    emptyHide.stop()
  else if (shown)
    emptyHide.start()
  shown = visible
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  // An IME can use Escape to cancel its candidate list.
  if (event.key !== 'Escape' || event.isComposing)
    return
  event.preventDefault()
  void hideInlay()
})
</script>

<template>
  <!-- macOS vibrancy and Windows acrylic draw the window surface. The page stays transparent and drags the window. -->
  <main :class="['drag-region h-full w-full flex flex-col bg-transparent text-neutral-900 dark:text-neutral-100']">
    <!-- Push to Talk opens the inlay when capture starts, before any transcript text. -->
    <VoiceDrafts variant="composer" show-silent-speech @presence="handlePresence">
      <template #hint>
        <kbd
          :class="[
            'min-w-6 rounded-md border px-1.5 py-0.5 text-center font-sans text-[11px] leading-none',
            'border-neutral-900/15 bg-neutral-900/5 text-neutral-600',
            'dark:border-white/15 dark:bg-white/8 dark:text-neutral-300',
          ]"
        >esc</kbd>
        <span>{{ t('tamagotchi.stage.inlay.hide') }}</span>
      </template>
    </VoiceDrafts>
  </main>
</template>
