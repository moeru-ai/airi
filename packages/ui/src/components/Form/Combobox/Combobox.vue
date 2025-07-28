<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxRoot,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'

const props = defineProps<{
  options: { groupLabel: string, children?: { label: string, value: any }[] }[]
  placeholder?: string
}>()

function toDisplayValue(value: any): string {
  const option = props.options.flatMap(group => group.children).find(option => option?.value === value)
  return option ? option.label : props.placeholder || ''
}
</script>

<template>
  <ComboboxRoot
    class="relative w-full"
  >
    <ComboboxAnchor
      :class="[
        'w-full inline-flex items-center justify-between rounded-lg border px-2 leading-none h-[35px] gap-[5px] outline-none',
        'text-xs text-neutral-700 dark:text-neutral-200 data-[placeholder]:text-neutral-200',
        'bg-white dark:bg-neutral-900 disabled:bg-neutral-100 hover:bg-neutral-50 dark:disabled:bg-neutral-900 dark:hover:bg-neutral-700',
        'border-neutral-200 dark:border-neutral-800 border-solid border-2 focus:border-neutral-300 dark:focus:border-neutral-600',
        'shadow-sm focus:shadow-[0_0_0_2px] focus:shadow-black',
        'transition-colors duration-200 ease-in-out',
      ]"
    >
      <ComboboxInput
        :class="[
          '!bg-transparent outline-none h-full selection:bg-grass5 placeholder-stone-400 w-full',
          'text-neutral-700 dark:text-neutral-200',
          'transition-colors duration-200 ease-in-out',
        ]"
        :placeholder="props.placeholder"
        :display-value="(val) => toDisplayValue(val)"
      />
      <ComboboxTrigger>
        <div
          i-solar:alt-arrow-down-linear
          :class="[
            'h-4 w-4',
            'text-neutral-700 dark:text-neutral-200',
            'transition-colors duration-200 ease-in-out',
          ]"
        />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent
      :avoid-collisions="true"
      :class="[
        'absolute z-10 w-full mt-1 min-w-[160px] overflow-hidden rounded-lg shadow-sm border will-change-[opacity,transform] max-h-50dvh',
        'data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-800 border-solid border-2 focus:border-neutral-300 dark:focus:border-neutral-600',
      ]"
    >
      <ComboboxViewport class="p-[2px]">
        <ComboboxEmpty
          :class="[
            'font-medium py-2 px-2',
            'text-xs text-neutral-700 dark:text-neutral-200',
            'transition-colors duration-200 ease-in-out',
          ]"
        />

        <template
          v-for="(group, index) in options"
          :key="group.name"
        >
          <ComboboxGroup>
            <ComboboxSeparator
              v-if="index !== 0"
              class="m-[5px] h-[1px] bg-neutral-400"
            />

            <ComboboxLabel
              :class="[
                'px-[25px] text-xs leading-[25px]',
                'text-neutral-500 dark:text-neutral-400',
                'transition-colors duration-200 ease-in-out',
              ]"
            >
              {{ group.groupLabel }}
            </ComboboxLabel>

            <ComboboxItem
              v-for="option in group.children"
              :key="option.label"
              :text-value="option.label"
              :value="option.value"
              :class="[
                'leading-none rounded-[5px] flex items-center h-[25px] pr-[35px] pl-[25px] relative select-none data-[disabled]:pointer-events-none data-[highlighted]:outline-none',
                'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800',
                'text-xs text-neutral-700 dark:text-neutral-200 data-[disabled]:text-neutral-400 dark:data-[disabled]:text-neutral-600 data-[highlighted]:text-grass1',
                'transition-colors duration-200 ease-in-out',
                'cursor-pointer',
              ]"
            >
              <ComboboxItemIndicator
                class="absolute left-0 w-[25px] inline-flex items-center justify-center opacity-30"
              >
                <div i-solar:alt-arrow-right-outline />
              </ComboboxItemIndicator>
              <span>
                {{ option.label }}
              </span>
            </ComboboxItem>
          </ComboboxGroup>
        </template>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>
