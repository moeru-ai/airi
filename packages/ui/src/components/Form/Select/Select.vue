<script setup lang="ts">
import { Dropdown as VDropdown } from 'floating-vue'
import { provide, ref } from 'vue'

import UIOption from './Option.vue'

const props = defineProps<{
  options?: { label: string, value: string | number }[]
  placeholder?: string
  disabled?: boolean
  title?: string
  layout?: 'horizontal' | 'vertical'
}>()

const show = ref(false)
const modelValue = defineModel<string | number>({ required: false })

function selectOption(value: string | number) {
  modelValue.value = value
}

function handleHide() {
  show.value = false
}

provide('selectOption', selectOption)
provide('hide', handleHide)
</script>

<template>
  <VDropdown
    auto-size
    auto-boundary-max-size
    w-full
  >
    <div
      min-w="[160px]" p="2.5" w-full
      class="focus:ring-2 focus:ring-black/10"
      border="~ dark:border-neutral-800"
      text="xs dark:neutral-200 disabled:neutral-400 dark:disabled:text-neutral-600 text-neutral-700"
      bg="white dark:neutral-900 disabled:neutral-100 hover:neutral-50 dark:disabled:neutral-800 dark:hover:neutral-800 "
      cursor="disabled:not-allowed pointer"
      flex items-center gap-2 rounded-lg shadow-sm outline-none transition-colors duration-150 ease-in-out
      :class="[
        props.disabled ? 'pointer-events-none' : '',
      ]"
    >
      <div class="flex-1 truncate">
        <slot :value="modelValue" />
      </div>
      <div i-solar:alt-arrow-down-linear class="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
    </div>

    <template #popper="{ hide }">
      <div class="min-w-[160px] flex flex-col gap-0.5 border border-neutral-200 rounded-lg bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        <slot name="options" :hide="hide">
          <template v-if="props.options && props.options.length">
            <UIOption
              v-for="option of props.options"
              :key="option.value"
              :value="option.value"
              :label="option.label"
              :active="modelValue === option.value"
              @click="selectOption(option.value); hide()"
            />
          </template>
        </slot>
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
