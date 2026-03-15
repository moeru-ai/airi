<script setup lang="ts">
import Bar from './bar.vue'

defineProps<{
  text: string
  iconOn: string
  iconOff: string
  description?: string
}>()
const model = defineModel<boolean>()
</script>

<template>
  <Bar :text="text" :description="description">
    <input v-model="model" :aria-checked="model" type="checkbox" hidden>
    <Transition name="slide-away" mode="out-in">
      <div v-if="model" :class="iconOn" transition="all ease-in-out duration-250" />
      <div v-else :class="iconOff" transition="all ease-in-out duration-250" />
    </Transition>
  </Bar>
</template>
