<script setup lang="ts">
defineProps<{
  text: string
  iconOn: string
  iconOff: string
}>()
const model = defineModel<boolean>()
</script>

<template>
  <label
    class="setting-bar cursor-pointer text-sm"
    bg="neutral-50 dark:neutral-800"
    hover="bg-neutral-200 dark:bg-neutral-700"
  >
    <input v-model="model" :aria-checked="model" type="checkbox" hidden>
    {{ $t(text) }}
    <Transition name="slide-away" mode="out-in">
      <div v-if="model" :class="iconOn" transition="all ease-in-out duration-250" />
      <div v-else :class="iconOff" transition="all ease-in-out duration-250" />
    </Transition>
  </label>
</template>

<style>
.setting-bar {
  --at-apply: transition-all ease-in-out duration-250 w-full flex items-center justify-between rounded-lg px-4 py-3
    outline-none;
}
</style>
