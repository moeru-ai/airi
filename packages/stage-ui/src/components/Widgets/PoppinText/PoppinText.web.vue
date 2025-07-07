<!-- Poppin'Text - Makes your text "kirakira dokidoki"!! -->

<script setup lang="ts">
import type { Animator } from './animators'

import { computed, onMounted, ref, shallowRef, watch } from 'vue'

const props = defineProps<{
  text: string
  animator?: Animator
}>()

const graphemeClusters = computed(() => [...props.text]) // Safely split text into grapheme clusters with UTF-8 awareness
const elements = ref<HTMLElement[]>([])

const animatorCleanupFn = shallowRef<() => void>()

onMounted(() => {
  animatorCleanupFn.value = props.animator?.(elements.value)
})

watch([graphemeClusters, () => props.animator], ([_, animator]) => {
  animatorCleanupFn.value?.()
  animatorCleanupFn.value = animator?.(elements.value)
}, { flush: 'post' }) // <- Ensure post-update refs
</script>

<template>
  <div class="relative overflow-hidden">
    <span
      v-for="(cluster, index) in graphemeClusters"
      :key="index"
      ref="elements"
      class="inline-block"
    >
      {{ cluster }}
    </span>
  </div>
</template>
