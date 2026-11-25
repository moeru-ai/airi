<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui'

import { dockItemClasses, Tooltip } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

/**
 * The grip that moves a free floating chat. The host passes the pointer and keyboard listeners, which go to the button,
 * because the host owns the drag of the window.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /**
   * - `island`: a 52px bar at the end of the window island, its outer corners as round as the island. Its focus ring
   *   lies inside, because the island meets the window edge.
   * - `dock`: a narrow item of a small `Dock`.
   */
  variant: 'island' | 'dock'
  tooltipSide: TooltipContentProps['side']
}>()

const { t } = useI18n()
</script>

<template>
  <Tooltip :label="t('tamagotchi.stage.chat-window.move')" :side="props.tooltipSide" :variant="props.variant === 'island' ? 'blurry' : undefined">
    <button
      v-bind="$attrs"
      type="button"
      :aria-label="t('tamagotchi.stage.chat-window.move')"
      :class="[
        'shrink-0 cursor-grab touch-none flex items-center justify-center outline-none transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300',
        props.variant === 'island'
          ? 'h-6 w-13 rounded-b-[18px] rounded-t-[6px] focus-visible:outline-offset-[-2px]'
          : 'h-7 w-5 rounded-full focus-visible:outline-offset-2',
        dockItemClasses('blurry'),
      ]"
    >
      <!-- The dots of the island are one step quieter than its icons, as the grip of the Controls Island. -->
      <div
        :class="props.variant === 'island'
          ? 'i-mingcute:dots-vertical-fill size-4 text-neutral-400/70 dark:text-neutral-400'
          : 'i-ph:dots-six-vertical-bold size-4'"
      />
    </button>
  </Tooltip>
</template>
