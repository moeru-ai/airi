<script setup lang="ts">
import type { ComputerUseViewOf } from './view'

import ComputerUseDelivery from './delivery.vue'
import ComputerUseKeycaps from './keycaps.vue'

import { CHIP, FACT_LABEL, FACT_VALUE, FACTS, LINE, LINE_ICON, NOTE, QUOTE } from './classes'
import { pointText } from './format'
import { useComputerUseLabels } from './use-labels'

/** Typing, keys, a keyboard sequence, focus, or the mouse, each with how AUV delivered it. */
const props = defineProps<{
  view: ComputerUseViewOf<'text' | 'keys' | 'keyboard' | 'focus' | 'move' | 'click' | 'drag'>
}>()

const { t, KEY, label } = useComputerUseLabels()
</script>

<template>
  <template v-if="props.view.kind === 'text'">
    <span :class="LINE">
      <span :class="[props.view.mode === 'paste' ? 'i-mingcute:paste-fill' : 'i-mingcute:keyboard-fill', LINE_ICON]" aria-hidden="true" />
      {{ props.view.mode === 'paste' ? t(`${KEY}.pasted`) : t(`${KEY}.typed`) }}
    </span>
    <div :class="QUOTE">
      {{ props.view.text }}
    </div>
    <ComputerUseDelivery :action="props.view.action" />
  </template>

  <template v-else-if="props.view.kind === 'keys'">
    <span :class="LINE">
      <span :class="['i-mingcute:command-fill', LINE_ICON]" aria-hidden="true" />
      {{ t(`${KEY}.pressed`) }}
      <ComputerUseKeycaps :keys="props.view.keys" />
      <span v-if="props.view.count" :class="NOTE">{{ t(`${KEY}.repeat`, { count: props.view.count }) }}</span>
      <span v-if="props.view.intervalMs" :class="NOTE">{{ t(`${KEY}.interval`, { ms: props.view.intervalMs }) }}</span>
      <span v-if="props.view.durationMs" :class="NOTE">{{ t(`${KEY}.hold`, { ms: props.view.durationMs }) }}</span>
    </span>
    <ComputerUseDelivery :action="props.view.action" />
  </template>

  <template v-else-if="props.view.kind === 'keyboard'">
    <span :class="LINE"><span :class="['i-mingcute:keyboard-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.steps`, { count: props.view.steps.length }, props.view.steps.length) }}</span>
    <div v-for="(step, index) in props.view.steps" :key="index" :class="['flex flex-col gap-1.5 rounded-lg px-2 py-1.5', 'bg-white dark:bg-neutral-900/60']">
      <span :class="['flex flex-wrap items-center gap-2 text-xs']">
        <span :class="['font-semibold tabular-nums text-primary-500 dark:text-primary-300']">{{ index + 1 }}</span>
        <ComputerUseKeycaps v-if="step.spec?.kind === 'press'" :keys="step.spec.keys" />
        <span v-else-if="step.spec?.kind === 'type_text'" :class="['break-words']">{{ t(`${KEY}.typed`) }} “{{ step.spec.text }}”</span>
        <code v-else-if="step.spec" :class="['break-all text-[11px]']">{{ step.spec.text }}</code>
      </span>
      <ComputerUseDelivery :action="step.action" />
    </div>
  </template>

  <template v-else-if="props.view.kind === 'focus'">
    <span :class="LINE"><span :class="['i-mingcute:edit-2-fill', LINE_ICON]" aria-hidden="true" />{{ t(`${KEY}.focused`, { query: props.view.query }) }}</span>
    <div :class="FACTS">
      <span :class="FACT_LABEL">{{ t(`${KEY}.app`) }}</span><span :class="FACT_VALUE">{{ props.view.app }}</span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.process`) }}</span><span :class="FACT_VALUE">{{ props.view.pid }}</span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.control`) }}</span><span :class="FACT_VALUE">{{ props.view.role }}<template v-if="props.view.title"> · {{ props.view.title }}</template></span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.value`) }}</span><span :class="FACT_VALUE">{{ props.view.value }}</span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.ax-path`) }}</span><span :class="FACT_VALUE">{{ props.view.path }}</span>
    </div>
    <ComputerUseDelivery :action="props.view.action" />
  </template>

  <template v-else-if="props.view.kind === 'move'">
    <span :class="LINE">
      <span :class="['i-mingcute:cursor-2-fill', LINE_ICON]" aria-hidden="true" />
      {{ t(`${KEY}.moved`) }} <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.point) }}</span>
    </span>
    <ComputerUseDelivery :action="props.view.action" />
  </template>

  <template v-else-if="props.view.kind === 'click'">
    <span :class="LINE">
      <span :class="['i-mingcute:cursor-3-fill', LINE_ICON]" aria-hidden="true" />
      {{ t(`${KEY}.clicked`) }} <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.onScreen) }}</span>
      <span :class="CHIP">{{ label('buttons', props.view.button) }}</span>
      <span v-if="props.view.count" :class="CHIP">{{ t(`${KEY}.click-count`, { count: props.view.count }) }}</span>
      <span :class="CHIP">{{ label('relative', props.view.relativeTo) }}</span>
      <span v-if="props.view.normalized" :class="CHIP">{{ t(`${KEY}.normalized`) }}</span>
      <ComputerUseKeycaps v-if="props.view.modifiers.length > 0" :keys="props.view.modifiers" />
    </span>
    <div :class="FACTS">
      <span :class="FACT_LABEL">{{ t(`${KEY}.requested`) }}</span><span :class="FACT_VALUE">{{ pointText(props.view.requested) }}</span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.on-screen`) }}</span><span :class="FACT_VALUE">{{ pointText(props.view.onScreen) }}</span>
    </div>
    <ComputerUseDelivery :action="props.view.action" />
  </template>

  <template v-else>
    <span :class="LINE">
      <span :class="['i-mingcute:hand-grab-fill', LINE_ICON]" aria-hidden="true" />
      {{ t(`${KEY}.dragged`) }}
      <span :class="['font-semibold tabular-nums']">{{ pointText(props.view.start) }} → {{ pointText(props.view.end) }}</span>
      <span :class="CHIP">{{ label('buttons', props.view.button) }}</span>
      <span :class="CHIP">{{ t(`${KEY}.duration`, { ms: props.view.durationMs }) }}</span>
      <span :class="CHIP">{{ label('relative', props.view.relativeTo) }}</span>
      <span v-if="props.view.normalized" :class="CHIP">{{ t(`${KEY}.normalized`) }}</span>
    </span>
    <div :class="FACTS">
      <span :class="FACT_LABEL">{{ t(`${KEY}.requested`) }}</span>
      <span :class="FACT_VALUE">{{ pointText(props.view.requestedStart) }} → {{ pointText(props.view.requestedEnd) }}</span>
      <span :class="FACT_LABEL">{{ t(`${KEY}.final`) }}</span>
      <span :class="FACT_VALUE">{{ pointText(props.view.final) }}</span>
    </div>
    <ComputerUseDelivery :action="props.view.action" />
  </template>
</template>
