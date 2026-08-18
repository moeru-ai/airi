<script setup lang="ts">
import { FieldSelect } from '@proj-airi/ui'
import { ref } from 'vue'

const simpleValue = ref<'option-1' | 'option-2' | 'option-3' | undefined>('option-2')
const groupedValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>('banana')
const customValue = ref<'apple' | 'banana' | 'carrot' | 'spinach' | undefined>('carrot')

const simpleOptions = [
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
</script>

<template>
  <Story
    title="Field Select"
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
        <FieldSelect
          v-model="simpleValue"
          label="Model Preset"
          description="Choose a basic preset using plain option rendering."
          :options="simpleOptions"
          placeholder="Choose a preset..."
        />
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Selected value: {{ simpleValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="grouped"
      title="Complex (Grouped Options, Plain Value)"
    >
      <div :class="['max-w-110', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <FieldSelect
          v-model="groupedValue"
          label="Ingredient"
          description="Grouped options with icon and description metadata."
          :options="groupedOptions"
          placeholder="Pick an ingredient..."
          layout="vertical"
        />
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Grouped value: {{ groupedValue || 'none' }}
        </p>
      </div>
    </Variant>

    <Variant
      id="custom-render"
      title="Complex (Custom Value And Option Rendering)"
    >
      <div :class="['max-w-110', 'w-full', 'flex', 'flex-col', 'gap-3']">
        <FieldSelect
          v-model="customValue"
          label="Ingredient"
          description="Custom value and option slots for richer presentation."
          :options="groupedOptions"
          placeholder="Pick an ingredient..."
          variant="blurry"
          shape="rounded"
        >
          <template #value="slotProps">
            <div :class="['min-w-0', 'flex', 'items-center', 'gap-2', 'px-2', 'py-1']">
              <span
                :class="[
                  'size-4 shrink-0',
                  slotProps.option?.icon ?? 'i-solar:question-circle-linear',
                ]"
              />
              <div :class="['min-w-0', 'flex', 'flex-1', 'items-center', 'justify-between', 'gap-2']">
                <span
                  :class="[
                    'truncate',
                    slotProps.option ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500',
                  ]"
                >
                  {{ slotProps.option?.label ?? slotProps.placeholder }}
                </span>
                <span
                  v-if="slotProps.option"
                  :class="['rounded-full', 'bg-primary-400/12', 'dark:bg-primary-400/18', 'px-2', 'py-0.5', 'text-xs', 'text-primary-700', 'dark:text-primary-200']"
                >
                  {{ slotProps.option.value }}
                </span>
              </div>
            </div>
          </template>

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
                    :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
                  >
                    {{ slotProps.option.description }}
                  </span>
                </div>
              </div>
              <span :class="['rounded-full', 'bg-primary-400/12', 'dark:bg-primary-400/18', 'px-2', 'py-0.5', 'text-xs', 'text-primary-700', 'dark:text-primary-200']">
                {{ slotProps.option.value }}
              </span>
            </div>
          </template>
        </FieldSelect>
        <p :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
          Custom rendered value: {{ customValue || 'none' }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
