<script setup lang="ts" generic="T extends AcceptableValue">
import type { AcceptableValue } from 'reka-ui'

import {
  SelectArrow,
  SelectContent,
  SelectGroup,
  SelectIcon,
  SelectLabel,
  SelectPortal,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed } from 'vue'

import SelectOption from './select-option.vue'

interface SelectOptionItem<T extends AcceptableValue> {
  label: string
  value: T
  description?: string
  disabled?: boolean
  icon?: string
}

interface SelectOptionGroupItem<T extends AcceptableValue> {
  groupLabel?: string
  children?: SelectOptionItem<T>[]
}

const props = withDefaults(defineProps<{
  options: SelectOptionItem<T>[] | SelectOptionGroupItem<T>[]
  placeholder?: string
  disabled?: boolean
  by?: string | ((a: T, b: T) => boolean)
  contentMinWidth?: string | number
  contentWidth?: string | number
  shape?: 'rounded' | 'default'
  variant?: 'blurry' | 'default'
}>(), {
  placeholder: 'Select an option',
  disabled: false,
  by: undefined,
  contentMinWidth: 160,
  contentWidth: undefined,
  shape: 'default',
  variant: 'default',
})

const modelValue = defineModel<T>({ required: false })

const normalizedOptions = computed<SelectOptionGroupItem<T>[]>(() => {
  if (!props.options.length) {
    return []
  }

  const [firstOption] = props.options
  if ('value' in firstOption) {
    return [
      {
        groupLabel: '',
        children: props.options as SelectOptionItem<T>[],
      },
    ]
  }

  return props.options as SelectOptionGroupItem<T>[]
})

const flattenedOptions = computed<SelectOptionItem<T>[]>(() =>
  normalizedOptions.value.flatMap(group => group.children ?? []),
)

const selectedOption = computed<SelectOptionItem<T> | undefined>(() =>
  flattenedOptions.value.find(option => isSelectedOption(option.value, modelValue.value)),
)

function isSelectedOption(a: T, b: T | undefined): boolean {
  if (b == null) {
    return false
  }

  if (typeof props.by === 'function') {
    return props.by(a, b)
  }

  if (typeof props.by === 'string') {
    return (a as Record<string, unknown> | null)?.[props.by] === (b as Record<string, unknown> | null)?.[props.by]
  }

  return a === b
}

function toCssSize(value?: string | number): string | undefined {
  if (value == null) {
    return undefined
  }

  return typeof value === 'number' ? `${value}px` : value
}
</script>

<template>
  <SelectRoot
    v-model="modelValue"
    :by="props.by"
    :disabled="props.disabled"
  >
    <SelectTrigger
      :class="[
        'group',
        'w-full inline-flex items-center justify-between border px-1 leading-none h-fit gap-[5px] outline-none',
        props.shape === 'rounded' ? 'rounded-full' : 'rounded-lg',
        'text-sm text-neutral-700 dark:text-neutral-200 data-[placeholder]:text-neutral-400 dark:data-[placeholder]:text-neutral-500',
        props.variant === 'default' ? 'bg-white dark:bg-neutral-900 disabled:bg-neutral-100 hover:bg-neutral-50 dark:disabled:bg-neutral-900 dark:hover:bg-neutral-700' : '',
        props.variant === 'blurry' ? 'bg-neutral-50/70 dark:bg-neutral-800/70 disabled:bg-neutral-100 hover:bg-neutral-100 dark:disabled:bg-neutral-900 dark:hover:bg-neutral-800' : '',
        props.variant === 'blurry' ? 'backdrop-blur-md' : '',
        'border-2 border-solid focus:border-primary-300 dark:focus:border-primary-400/50',
        props.variant === 'default' ? 'border-neutral-200 dark:border-neutral-800' : '',
        props.variant === 'blurry' ? 'border-neutral-100/60 dark:border-neutral-800/30' : '',
        'shadow-sm focus:shadow-[0_0_0_2px] focus:shadow-black/10 dark:focus:shadow-black/30',
        'transition-colors duration-200 ease-in-out',
        props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ]"
    >
      <div :class="['min-w-0 flex-1 text-left']">
        <slot
          v-if="$slots.value"
          name="value"
          v-bind="{ option: selectedOption, value: modelValue, placeholder: props.placeholder }"
        >
          <span
            :class="[
              'block truncate',
              selectedOption ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500',
            ]"
          >
            {{ selectedOption?.label ?? props.placeholder }}
          </span>
        </slot>
        <SelectValue
          v-else
          v-model="modelValue"
          :placeholder="props.placeholder"
        />
      </div>
      <SelectIcon as-child>
        <div
          i-solar:alt-arrow-down-linear
          :class="[
            'h-4 w-4 shrink-0',
            'text-neutral-700 dark:text-neutral-200',
            'transition-transform duration-200 ease-in-out',
            'group-data-[state=open]:rotate-180',
          ]"
        />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        :side-offset="4"
        :avoid-collisions="true"
        :class="[
          // NOTICE: DialogContent/DialogOverlay use z-[9999], and DrawerContent uses z-[1000].
          // SelectContent must render above these layers so that dropdowns inside
          // Dialog/Drawer are not hidden behind the overlay or dismissed unexpectedly.
          // Read more at: https://github.com/moeru-ai/airi/issues/1136
          'z-[10010]',
          'overflow-hidden rounded-xl shadow-sm border will-change-[opacity,transform]',
          'data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade',
          'bg-white dark:bg-neutral-900',
          'border-neutral-200 dark:border-neutral-800 border-solid border-2',
        ]"
        :style="{
          width: toCssSize(props.contentWidth) ?? 'var(--reka-select-trigger-width)',
          minWidth: toCssSize(props.contentMinWidth),
        }"
      >
        <SelectViewport
          :class="[
            'p-[2px]',
            'max-h-50dvh',
            'overflow-y-auto',
          ]"
        >
          <template
            v-for="(group, groupIndex) in normalizedOptions"
            :key="group.groupLabel || `group-${groupIndex}`"
          >
            <SelectGroup :class="['overflow-x-hidden']">
              <SelectSeparator
                v-if="groupIndex !== 0"
                :class="['m-[5px]', 'h-[1px]', 'bg-neutral-200 dark:bg-neutral-800']"
              />

              <SelectLabel
                v-if="group.groupLabel"
                :class="[
                  'px-[25px] text-xs leading-[25px]',
                  'text-neutral-500 dark:text-neutral-400',
                  'transition-colors duration-200 ease-in-out',
                ]"
              >
                {{ group.groupLabel }}
              </SelectLabel>

              <SelectOption
                v-for="(option, optionIndex) in group.children || []"
                :key="`${group.groupLabel || groupIndex}-${option.label}-${optionIndex}`"
                :option="option"
              >
                <template
                  v-if="$slots.option"
                  #default="{ option: slotOption }"
                >
                  <slot
                    name="option"
                    v-bind="{ option: slotOption }"
                  />
                </template>
              </SelectOption>
            </SelectGroup>
          </template>
        </SelectViewport>

        <SelectArrow
          :class="[
            'fill-white dark:fill-neutral-900',
            'stroke-neutral-200 dark:stroke-neutral-800',
          ]"
        />
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
