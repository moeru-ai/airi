<script setup lang="ts">
import { Dropdown as VDropdown } from 'floating-vue'
import { computed } from 'vue'

const props = defineProps<{
  options: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  title?: string
}>()

const modelValue = defineModel<string | number>({ required: true })

const selectedLabel = computed(() => {
  const selected = props.options.find(opt => opt.value === modelValue.value)
  return selected ? selected.label : props.placeholder
})

function selectOption(value: string | number) {
  modelValue.value = value
}
</script>

<template>
  <VDropdown
    auto-size
    auto-boundary-max-size
  >
    <div
      class="min-w-[160px] flex cursor-pointer items-center justify-between gap-2 border rounded-lg bg-white p-2.5 text-xs text-neutral-700 shadow-sm outline-none transition-colors disabled:cursor-not-allowed dark:border-neutral-800 dark:bg-neutral-900 disabled:bg-neutral-100 hover:bg-neutral-50 dark:text-neutral-200 disabled:text-neutral-400 focus:ring-2 focus:ring-black/10 dark:disabled:bg-neutral-800 dark:hover:bg-neutral-800 dark:disabled:text-neutral-600"
      :class="{ 'pointer-events-none': props.disabled }"
    >
      <div class="flex-1 truncate">
        <slot :label="selectedLabel">
          {{ selectedLabel }}
        </slot>
      </div>
      <div i-solar:alt-arrow-down-bold-duotone class="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
    </div>

    <template #popper="{ hide }">
      <div class="min-w-[160px] flex flex-col gap-0.5 border border-neutral-200 rounded-lg bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        <div
          v-for="option of props.options"
          v-bind="{ ...$attrs, class: null, style: null }"
          :key="option.value"
          class="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          :class="{
            'bg-neutral-100 dark:bg-neutral-800': modelValue === option.value,
          }"
          @click="selectOption(option.value); hide()"
        >
          {{ option.label }}
        </div>
      </div>
    </template>
  </VDropdown>
</template>

<style>
.resize-observer[data-v-b329ee4c] {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  border: none;
  background-color: transparent;
  pointer-events: none;
  display: block;
  overflow: hidden;
  opacity: 0;
}

.resize-observer[data-v-b329ee4c] object {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: -1;
}

.v-popper__popper {
  z-index: 10000;
  top: 0;
  left: 0;
  outline: none;
}

.v-popper__arrow-container {
  display: none;
}

.v-popper__inner {
  border: none !important;
}
</style>
