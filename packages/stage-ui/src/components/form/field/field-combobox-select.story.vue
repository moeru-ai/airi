<script setup lang="ts">
import { FieldCombobox } from '@proj-airi/ui'
import { ref } from 'vue'

const basicValue = ref<'option-1' | 'option-2' | 'option-3' | undefined>('option-2')
const customValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>('banana')
const emptyValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>(undefined)

const basicOptions = [
  { label: 'Option 1', value: 'option-1' as const },
  { label: 'Option 2', value: 'option-2' as const },
  { label: 'Option 3', value: 'option-3' as const },
]

const richOptions = [
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
]
</script>

<template>
  <Story
    title="Field Combobox Select"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="simple"
      title="Simple (Plain Value)"
    >
      <div :class="['max-w-110', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <FieldCombobox
          v-model="basicValue"
          label="Realtime Model"
          description="Search and pick from simple options."
          :options="basicOptions"
          placeholder="Choose a model..."
        />
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Selected value: {{ basicValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="custom-option"
      title="Complex (Custom Option Rendering)"
    >
      <div :class="['max-w-110', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <FieldCombobox
          v-model="customValue"
          label="Ingredient"
          description="Custom option content with icon, description, and tag."
          :options="richOptions"
          placeholder="Search ingredients..."
          layout="vertical"
        >
          <template #option="{ option }">
            <div :class="['min-w-0', 'flex', 'w-full', 'items-center', 'justify-between', 'gap-3', 'py-1']">
              <div :class="['min-w-0', 'flex', 'items-center', 'gap-2']">
                <span
                  v-if="option.icon"
                  :class="[
                    'size-4 shrink-0',
                    'text-current',
                    option.icon,
                  ]"
                />
                <div :class="['min-w-0', 'flex', 'flex-col']">
                  <span :class="['truncate']">{{ option.label }}</span>
                  <span
                    v-if="option.description"
                    :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
                  >
                    {{ option.description }}
                  </span>
                </div>
              </div>
              <span :class="['rounded-full', 'bg-primary-400/12', 'dark:bg-primary-400/18', 'px-2', 'py-0.5', 'text-xs', 'text-primary-700', 'dark:text-primary-200']">
                {{ option.value }}
              </span>
            </div>
          </template>
        </FieldCombobox>
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Custom rendered value: {{ customValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="custom-empty"
      title="Custom Empty State"
    >
      <div :class="['max-w-110', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <FieldCombobox
          v-model="emptyValue"
          label="Ingredient"
          description="Provides custom empty content when no match is found."
          :options="richOptions"
          placeholder="Try typing a non-existing item..."
        >
          <template #empty>
            <div :class="['flex', 'items-center', 'gap-2', 'px-2', 'py-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              <span i-solar:magnifer-zoom-out-linear class="size-4" />
              <span>No items match your search.</span>
            </div>
          </template>
        </FieldCombobox>
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Selected value: {{ emptyValue || 'none' }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
