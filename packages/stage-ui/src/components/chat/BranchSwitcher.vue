<script setup lang="ts">
const props = defineProps<{
  branchCount: number
  selectedIndex: number
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

function prev() {
  const newIndex = props.selectedIndex - 1
  if (newIndex >= 0)
    emit('select', newIndex)
}

function next() {
  const newIndex = props.selectedIndex + 1
  if (newIndex < props.branchCount)
    emit('select', newIndex)
}
</script>

<template>
  <div 10 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-gray-400>
    <button
      :disabled="selectedIndex <= 0"
      h-4 w-4 flex items-center justify-center rounded-full transition-colors
      :class="selectedIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 hover:text-white cursor-pointer'"
      @click="prev"
    >
      <div i-carbon-chevron-left text-xs />
    </button>
    <span text-xs>
      {{ selectedIndex + 1 }}/{{ branchCount }}
    </span>
    <button
      :disabled="selectedIndex >= branchCount - 1"
      h-4 w-4 flex items-center justify-center rounded-full transition-colors
      :class="selectedIndex >= branchCount - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 hover:text-white cursor-pointer'"
      @click="next"
    >
      <div i-carbon-chevron-right text-xs />
    </button>
  </div>
</template>
