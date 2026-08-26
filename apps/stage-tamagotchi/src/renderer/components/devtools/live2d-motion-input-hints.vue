<script setup lang="ts">
interface Live2DMotionInputHint {
  action: string
  controller?: string
  keyboard?: string
}

const props = defineProps<{
  controllerLabel: string
  hints: readonly Live2DMotionInputHint[]
  keyboardLabel: string
}>()
</script>

<template>
  <dl :class="['grid overflow-hidden rounded-xl bg-neutral-100/75 text-xs dark:bg-neutral-900/55']">
    <div
      v-for="hint in props.hints"
      :key="hint.action"
      :class="[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2',
        'not-last:border-b not-last:border-neutral-200/65 dark:not-last:border-neutral-800/70',
      ]"
    >
      <dt :class="['min-w-0 leading-tight text-neutral-600 dark:text-neutral-300']">
        {{ hint.action }}
      </dt>
      <dd :class="['flex flex-wrap items-center justify-end gap-1.5']">
        <span
          v-if="hint.keyboard"
          :title="props.keyboardLabel"
          :class="['inline-flex items-center gap-1 rounded-md bg-white/75 px-1.5 py-1 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300']"
        >
          <span :class="['i-solar:keyboard-linear size-3.5']" />
          {{ hint.keyboard }}
        </span>
        <span
          v-if="hint.controller"
          :title="props.controllerLabel"
          :class="['inline-flex items-center gap-1 rounded-md bg-primary-100/80 px-1.5 py-1 font-mono text-[10px] text-primary-800 dark:bg-primary-900/45 dark:text-primary-200']"
        >
          <span :class="['i-solar:gamepad-minimalistic-linear size-3.5']" />
          {{ hint.controller }}
        </span>
      </dd>
    </div>
  </dl>
</template>
