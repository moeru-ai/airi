<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'

const props = defineProps<{
  options: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  title?: string
}>()

const modelValue = defineModel<string | number>({ required: true })

const isOpen = ref(false)
const selectedLabel = computed(() => {
  const selected = props.options.find(opt => opt.value === modelValue.value)
  return selected ? selected.label : props.placeholder
})

function toggleDropdown() {
  if (!props.disabled) {
    isOpen.value = !isOpen.value
  }
}

function selectOption(value: string | number) {
  modelValue.value = value
  isOpen.value = false
}

// Close dropdown when clicking outside
const dropdownRef = ref<HTMLElement | null>(null)
onClickOutside(dropdownRef, () => {
  isOpen.value = false
})
</script>

<template>
  <div
    ref="dropdownRef"
    class="relative w-full font-sans"
  >
    <button
      type="button"
      class="min-w-[160px] flex items-center justify-between gap-2 border rounded-lg bg-white p-2.5 text-xs text-neutral-700 shadow-sm outline-none transition-colors dark:border-neutral-800 dark:bg-neutral-900 hover:bg-neutral-50 dark:text-neutral-200 focus:shadow-[0_0_0_2px] focus:shadow-black dark:hover:bg-neutral-800"
      :class="{ 'cursor-not-allowed bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600': props.disabled }"
      @click="toggleDropdown"
    >
      <span>{{ selectedLabel }}</span>
      <div i-solar:alt-arrow-down-bold-duotone class="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 top-[calc(100%+4px)] z-10 min-w-[160px] border rounded-lg bg-white shadow-lg transition-all dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div
        v-if="props.title"
        class="border-b p-2 text-xs text-neutral-500 font-semibold dark:border-neutral-800"
      >
        {{ props.title }}
      </div>
      <div class="max-h-[300px] overflow-y-auto p-1">
        <div
          v-for="option in props.options"
          :key="option.value"
          class="flex cursor-pointer select-none items-center rounded p-2 text-xs text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
          :class="{ 'bg-neutral-100 dark:bg-neutral-700': modelValue === option.value }"
          @click="selectOption(option.value)"
        >
          {{ option.label }}
        </div>
      </div>
    </div>
  </div>
</template>
