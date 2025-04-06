<script setup lang="ts">
defineProps<{
  text: string
  iconOn: string
  iconOff: string
  description?: string
}>()
const model = defineModel<boolean>()
</script>

<template>
  <label
    class="w-full flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 text-sm outline-none transition-all duration-250 ease-in-out"
    bg="neutral-50 dark:neutral-800"
    hover="bg-neutral-200 dark:bg-neutral-700"
  >
    <input v-model="model" :aria-checked="model" type="checkbox" hidden>
    <div>
      {{ $t(text) }}
      <div v-if="description" text="sm neutral-500">
        {{ $t(description) }}
      </div>
    </div>
    <Transition name="slide-away" mode="out-in">
      <div v-if="model" :class="iconOn" transition="all ease-in-out duration-250" />
      <div v-else :class="iconOff" transition="all ease-in-out duration-250" />
    </Transition>
  </label>
</template>
