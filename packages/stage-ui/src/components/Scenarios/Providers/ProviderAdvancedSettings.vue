<script setup lang="ts">
import { ref } from 'vue'

import Collapsable from '../../Misc/Collapsable.vue'

const props = defineProps<{
  title?: string
  initialVisible?: boolean
}>()

const visible = ref(props.initialVisible || false)

function toggleVisible() {
  visible.value = !visible.value
}
</script>

<template>
  <Collapsable w-full>
    <template #trigger="slotProps">
      <button
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="() => slotProps.setVisible(!slotProps.visible) && toggleVisible()"
      >
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          <span>{{ title || 'Advanced' }}</span>
        </h2>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-linear />
        </div>
      </button>
    </template>
    <div mt-4>
      <slot />
    </div>
  </Collapsable>
</template>
