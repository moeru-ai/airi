<script setup lang="ts">
import type { ComputerUseViewOf } from './view'

import ComputerUseDelivery from './delivery.vue'
import ComputerUseKeycaps from './keycaps.vue'
import ComputerUseTextMatches from './text-matches.vue'

import { CHIP, LINE, LINE_ICON, NOTE } from './classes'
import { pointText, rectText } from './format'
import { useComputerUseLabels } from './use-labels'

/** Text that OCR found on the screen or in a window, and the text that a click command clicked. */
const props = defineProps<{
  view: ComputerUseViewOf<'matches' | 'click-text'>
}>()

const { t, KEY, label } = useComputerUseLabels()
</script>

<template>
  <template v-if="props.view.kind === 'matches'">
    <span :class="LINE">
      <span :class="['i-mingcute:search-3-fill', LINE_ICON]" aria-hidden="true" />
      {{ props.view.matches.length > 0
        ? `${t(`${KEY}.found`, { query: props.view.query })} · ${t(`${KEY}.matches`, { count: props.view.matches.length }, props.view.matches.length)}`
        : t(`${KEY}.not-found`, { query: props.view.query }) }}
    </span>
    <span v-if="props.view.window" :class="NOTE">
      {{ t(`${KEY}.window`) }} · {{ props.view.window.title }} · {{ props.view.window.app_name }} · {{ rectText(props.view.window.frame) }}
    </span>
    <ComputerUseTextMatches v-if="props.view.matches.length > 0" :matches="props.view.matches" />
  </template>

  <template v-else>
    <span :class="LINE">
      <span :class="['i-mingcute:cursor-3-fill', LINE_ICON]" aria-hidden="true" />
      {{ t(`${KEY}.clicked-text`, { query: props.view.query }) }}
      <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.point) }}</span>
    </span>
    <span v-if="props.view.window" :class="NOTE">
      {{ t(`${KEY}.window`) }} · {{ props.view.window.title }} · {{ props.view.window.app_name }} · {{ rectText(props.view.window.frame) }}
    </span>
    <ComputerUseTextMatches :matches="props.view.matches" :selected-index="props.view.selectedIndex" />
    <div v-if="props.view.options" :class="['flex flex-wrap items-center gap-1']">
      <span :class="CHIP">{{ label('buttons', props.view.options.button) }}</span>
      <span :class="CHIP">{{ label('clicks', props.view.options.click) }}</span>
      <ComputerUseKeycaps v-if="props.view.options.modifiers.length > 0" :keys="props.view.options.modifiers" />
      <span :class="CHIP">{{ props.view.options.policy }}</span>
      <span :class="CHIP">{{ props.view.options.windowStrategy }}</span>
    </div>
    <ComputerUseDelivery :action="props.view.action" />
  </template>
</template>
