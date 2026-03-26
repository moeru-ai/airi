<script setup lang="ts">
import { Select } from '@proj-airi/ui'
import { ref } from 'vue'

const basicValue = ref<'option-1' | 'option-2' | 'option-3' | undefined>('option-1')
const groupedValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>('banana')
const customValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>('carrot')
const disabledValue = ref<'busy' | 'away' | 'offline' | undefined>('away')

const basicOptions = [
  { label: 'Option 1', value: 'option-1' as const },
  { label: 'Option 2', value: 'option-2' as const },
  { label: 'Option 3', value: 'option-3' as const },
]

const groupedOptions = [
  {
    groupLabel: 'Fruits',
    children: [
      {
        label: 'Apple',
        value: 'apple' as const,
        icon: 'i-solar:apple-line-duotone',
        description: 'Crisp and neutral',
      },
      {
        label: 'Banana',
        value: 'banana' as const,
        icon: 'i-solar:leaf-line-duotone',
        description: 'Soft and familiar',
      },
    ],
  },
  {
    groupLabel: 'Vegetables',
    children: [
      {
        label: 'Carrot',
        value: 'carrot' as const,
        icon: 'i-solar:cup-star-line-duotone',
        description: 'Bright and sweet',
      },
      {
        label: 'Spinach',
        value: 'spinach' as const,
        icon: 'i-solar:leaf-line-duotone',
        description: 'Leafy and dense',
      },
    ],
  },
]

const statusOptions = [
  { label: 'Busy', value: 'busy' as const },
  { label: 'Away', value: 'away' as const },
  { label: 'Offline', value: 'offline' as const, disabled: true },
]
</script>

<template>
  <Story
    title="Select"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic"
      title="Basic Select"
    >
      <div :class="['max-w-80', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <Select
          v-model="basicValue"
          :options="basicOptions"
          placeholder="Choose an option..."
        />
        <p :class="['text-sm', 'text-neutral-600 dark:text-neutral-300']">
          Selected: {{ basicValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="grouped"
      title="Grouped Options"
    >
      <div :class="['max-w-90', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <Select
          v-model="groupedValue"
          :options="groupedOptions"
          placeholder="Pick produce"
        />
        <p :class="['text-sm', 'text-neutral-600 dark:text-neutral-300']">
          Grouped value: {{ groupedValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="custom-option"
      title="Custom Option Rendering"
    >
      <div :class="['max-w-90', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <Select
          v-model="customValue"
          :options="groupedOptions"
          placeholder="Pick produce"
        >
          <template #option="slotProps">
            <div :class="['min-w-0', 'flex', 'flex-1', 'items-center', 'justify-between', 'gap-3', 'py-1']">
              <div :class="['min-w-0', 'flex', 'items-center', 'gap-2']">
                <span
                  v-if="slotProps.option.icon"
                  :class="[
                    'size-4 shrink-0',
                    'text-current',
                    slotProps.option.icon,
                  ]"
                />
                <div :class="['min-w-0', 'flex', 'flex-col']">
                  <span :class="['truncate']">{{ slotProps.option.label }}</span>
                  <span
                    v-if="slotProps.option.description"
                    :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']"
                  >
                    {{ slotProps.option.description }}
                  </span>
                </div>
              </div>
              <span :class="['rounded-full', 'bg-primary-400/12 dark:bg-primary-400/18', 'px-2', 'py-0.5', 'text-xs', 'text-primary-700 dark:text-primary-200']">
                {{ slotProps.option.value }}
              </span>
            </div>
          </template>
        </Select>
        <p :class="['text-sm', 'text-neutral-600 dark:text-neutral-300']">
          Custom option value: {{ customValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="disabled"
      title="Disabled State"
    >
      <div :class="['max-w-80', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <Select
          v-model="disabledValue"
          :options="statusOptions"
          placeholder="Disabled select"
          disabled
        />
        <p :class="['text-sm', 'text-neutral-600 dark:text-neutral-300']">
          Disabled selection: {{ disabledValue || 'none' }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
