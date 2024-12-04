<script lang="ts" setup>
import { watchEffect } from 'vue'
import TransitionVertical from './TransitionVertical.vue'

const props = defineProps<{
  default?: boolean
  label?: string
}>()
const isVisible = defineModel<boolean>({ default: false })
watchEffect(() => {
  if (props.default != null) {
    isVisible.value = !!props.default
  }
})
</script>

<template>
  <div flex="~ col" border="~ gray/25 rounded-lg" divide="y dashed gray/25" of-clip shadow-sm>
    <button
      sticky top-0 z-10 flex items-center justify-between px2 py1 text-sm backdrop-blur-xl
      @click="isVisible = !isVisible"
    >
      <span>
        <slot name="label">
          {{ props.label ?? 'Collapsable' }}
        </slot>
      </span> <span op50>{{ isVisible ? '▲' : '▼' }}</span>
    </button>
    <TransitionVertical>
      <div v-if="isVisible" w-full>
        <slot />
      </div>
    </TransitionVertical>
  </div>
</template>
