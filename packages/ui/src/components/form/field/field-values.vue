<script setup lang="ts">
import { Input } from '../input'

const props = defineProps<{
  label?: string
  description?: string
  name?: string
  valuePlaceholder?: string
  required?: boolean
  inputClass?: string
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
  (e: 'add'): void
}>()

const items = defineModel<string[]>({ required: true })

function addItem() {
  items.value.push('')
  emit('add')
}

function removeItem(index: number) {
  items.value.splice(index, 1)
  emit('remove', index)
}
</script>

<template>
  <div :class="['max-w-full']">
    <label :class="['flex', 'flex-col', 'gap-2']">
      <div>
        <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required !== false" :class="['text-red-500']">*</span>
        </div>
        <div :class="['text-nowrap', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>

      <div v-auto-animate :class="['flex flex-col gap-2']">
        <div
          v-for="(_, index) in items"
          :key="index"
          :class="['flex w-full items-center gap-2']"
        >
          <Input
            v-model="items[index]"
            :placeholder="props.valuePlaceholder"
            :class="['flex-1']"
          />
          <button
            type="button"
            :class="[
              'shrink-0',
              'text-neutral-400 hover:text-red-500',
              'transition-colors',
            ]"
            @click="removeItem(index)"
          >
            <div :class="['i-solar:minus-circle-line-duotone size-5']" />
          </button>
        </div>

        <button
          type="button"
          :class="[
            'flex w-full items-center justify-center gap-2',
            'rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700',
            'py-2 text-xs text-neutral-500 dark:text-neutral-400',
            'transition-colors',
            'hover:border-primary-400 hover:text-primary-500',
            'dark:hover:border-primary-600 dark:hover:text-primary-400',
          ]"
          @click="addItem"
        >
          <div :class="['i-solar:add-circle-line-duotone size-4']" />
        </button>
      </div>
    </label>
  </div>
</template>
