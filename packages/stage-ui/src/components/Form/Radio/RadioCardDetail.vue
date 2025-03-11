<script setup lang="ts">
import { ref } from 'vue'

import TransitionVertical from '../../TransitionVertical.vue'

withDefaults(defineProps<{
  id: string
  name: string
  value: string
  title: string
  description?: string
  modelValue: string
  deprecated?: boolean
  showExpandCollapse?: boolean
  expandCollapseThreshold?: number
  customInputValue?: string
  customInputPlaceholder?: string
  showCustomInput?: boolean
}>(), {
  deprecated: false,
  showExpandCollapse: true,
  expandCollapseThreshold: 100,
  customInputValue: '',
  customInputPlaceholder: '',
  showCustomInput: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:customInputValue', value: string): void
}>()

// Track if description is expanded
const isExpanded = ref(false)

// Toggle description expansion
function toggleExpansion() {
  isExpanded.value = !isExpanded.value
}

// Update custom input value
function updateCustomInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:customInputValue', target.value)
}
</script>

<template>
  <label
    :key="id"
    class="relative flex cursor-pointer items-start rounded-xl p-3 pr-[20px]"
    transition="all duration-200 ease-in-out"
    border="2 solid"
    :class="[
      modelValue === value
        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900'
        : 'bg-white dark:bg-neutral-900/20 border-neutral-200 dark:border-neutral-700 hover:border-primary-500/30 dark:hover:border-primary-400/30',
      deprecated ? 'opacity-60' : '',
    ]"
  >
    <input
      :checked="modelValue === value"
      type="radio"
      :name="name"
      :value="value"
      class="absolute opacity-0"
      @change="$emit('update:modelValue', value)"
    >
    <div class="relative mr-3 mt-0.5 flex-shrink-0">
      <div
        class="size-5 border-2 rounded-full transition-colors duration-200"
        :class="[
          modelValue === value
            ? 'border-primary-500 dark:border-primary-400'
            : 'border-neutral-300 dark:border-neutral-600',
        ]"
      >
        <div
          class="absolute left-1/2 top-1/2 size-3 rounded-full transition-opacity duration-200 -translate-x-1/2 -translate-y-1/2"
          :class="[
            modelValue === value
              ? 'opacity-100 bg-primary-500 dark:bg-primary-400'
              : 'opacity-0',
          ]"
        />
      </div>
    </div>
    <div class="w-full flex flex-col gap-2">
      <div class="flex items-center">
        <span
          class="line-clamp-1 font-medium"
          :class="[
            modelValue === value
              ? 'text-neutral-700 dark:text-neutral-300'
              : 'text-neutral-700 dark:text-neutral-400',
          ]"
        >
          {{ title }}
        </span>
      </div>

      <!-- Truncated description with expand/collapse functionality -->
      <div v-if="description" class="relative">
        <!-- Description with ellipsis (limited to 2 lines) -->
        <TransitionVertical>
          <div
            v-if="!isExpanded"
            class="line-clamp-2 cursor-pointer text-xs"
            :class="[
              modelValue === value
                ? 'text-neutral-600 dark:text-neutral-400'
                : 'text-neutral-500 dark:text-neutral-500',
            ]"
            :title="description"
            @click.prevent="toggleExpansion"
          >
            {{ description }}
          </div>

          <!-- Expanded description -->
          <div
            v-else
            class="cursor-pointer text-xs"
            :class="[
              modelValue === value
                ? 'text-neutral-600 dark:text-neutral-400'
                : 'text-neutral-500 dark:text-neutral-500',
            ]"
            @click.prevent="toggleExpansion"
          >
            {{ description }}
          </div>
        </TransitionVertical>

        <!-- Expand/collapse button for long descriptions -->
        <button
          v-if="showExpandCollapse && description.length > expandCollapseThreshold"
          class="text-primary-500 dark:text-primary-400 mt-0.5 inline-flex items-center text-xs"
          @click.prevent="toggleExpansion"
        >
          <span>{{ isExpanded ? 'Show less' : 'Show more' }}</span>
          <div
            :class="{ 'rotate-180': isExpanded }"
            class="transition-transform duration-200"
          >
            <div i-solar:alt-arrow-down-bold-duotone ml-0.5 text-xs />
          </div>
        </button>
      </div>

      <!-- Custom model input field -->
      <div v-if="showCustomInput && modelValue === value" class="mt-2">
        <input
          :value="customInputValue"
          type="text"
          class="w-full border border-neutral-300 rounded bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          :placeholder="customInputPlaceholder"
          @input="updateCustomInput"
        >
      </div>
    </div>
  </label>
</template>
