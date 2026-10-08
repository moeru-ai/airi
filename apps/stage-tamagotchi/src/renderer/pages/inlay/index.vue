<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { VoiceDrafts } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { electronInlayHide } from '../../../shared/eventa'

const { t } = useI18n()
const hideInlay = useElectronEventaInvoke(electronInlayHide)

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  // An IME can use Escape to cancel its candidate list.
  if (event.key !== 'Escape' || event.isComposing)
    return
  event.preventDefault()
  void hideInlay()
})
</script>

<template>
  <!-- macOS vibrancy and Windows acrylic draw the window surface. The page stays transparent. -->
  <main :class="['h-full w-full flex flex-col bg-transparent text-neutral-900 dark:text-neutral-100']">
    <div :class="['drag-region h-2 shrink-0']" />
    <div :class="['min-h-0 flex-1 px-2 pb-2']">
      <VoiceDrafts variant="composer" />
    </div>
    <footer
      :class="[
        'drag-region h-9 flex shrink-0 items-center gap-2 px-4',
        'border-t border-neutral-900/10 dark:border-white/10',
        'text-xs text-neutral-500 dark:text-neutral-400',
      ]"
    >
      <kbd
        :class="[
          'min-w-6 rounded-md border px-1.5 py-0.5 text-center font-sans text-[11px] leading-none',
          'border-neutral-900/15 bg-neutral-900/5 text-neutral-600',
          'dark:border-white/15 dark:bg-white/8 dark:text-neutral-300',
        ]"
      >esc</kbd>
      <span>{{ t('tamagotchi.stage.inlay.hide') }}</span>
    </footer>
  </main>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
