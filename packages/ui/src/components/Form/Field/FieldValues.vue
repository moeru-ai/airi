<script setup lang="ts">
import Input from '../Input/Input.vue'

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
  <div class="max-w-full">
    <label class="flex flex-col gap-2">
      <div>
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ props.label }}
          </slot>
          <span v-if="props.required !== false" class="text-red-500">*</span>
        </div>
        <div class="text-nowrap text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ props.description }}
          </slot>
        </div>
      </div>

      <div v-auto-animate class="~ col gap-2">
        <div
          v-for="(_, index) in items"
          :key="index"
          class="w-full flex items-center gap-2"
        >
          <Input
            v-model="items[index]"
            :placeholder="props.valuePlaceholder"
            class="w-90%"
          />
          <button i-solar:minus-circle-line-duotone size="6" class="min-w-20px w-10% flex text-red-500" @click="removeItem(index)" />
        </div>

        <div i-solar:add-circle-line-duotone size="6" class="mt-2 w-4/5 text-blue-500" @click="addItem" />
      </div>
    </label>
  </div>
</template>
