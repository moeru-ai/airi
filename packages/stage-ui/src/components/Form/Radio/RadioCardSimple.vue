<script setup lang="ts">
defineProps<{
  id: string
  name: string
  value: string
  title: string
  description?: string
  modelValue: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <label
    :key="id"
    border="2px solid"
    class="relative"
    transition="all duration-200 ease-in-out"
    :class="[
      modelValue === value
        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900'
        : 'bg-white dark:bg-neutral-900/20 border-neutral-200 dark:border-neutral-700 hover:border-primary-500/30 dark:hover:border-primary-400/30',
    ]"
    flex="~ col"
    block min-w-50 w-fit cursor-pointer items-start rounded-xl p-4 text-left
  >
    <input
      :checked="modelValue === value"
      type="radio"
      :name="name"
      :value="value"
      class="[&:checked+div]:border-primary-500 dark:[&:checked+div]:border-primary-400 absolute opacity-0 [&:checked+div_.radio-dot]:opacity-100"
      @change="$emit('update:modelValue', value)"
    >
    <div
      class="radio-circle absolute left-2 top-2 size-5 rounded-full"
      border="2 solid neutral-300 dark:neutral-600"
      transition="all duration-200 ease-in-out"
    >
      <div
        class="radio-dot absolute left-1/2 top-1/2 size-3 rounded-full opacity-0 -translate-x-1/2 -translate-y-1/2"
        transition="all duration-200 ease-in-out"
        bg="primary-500 dark:primary-400"
      />
    </div>
    <div flex="~ col" min-h-16 w-full items-start justify-center pb-2 pl-5 pr-4 pt-2>
      <span
        class="radio-item-name font-bold"
        text="md"
        :class="[
          modelValue === value
            ? 'text-neutral-700 dark:text-neutral-300'
            : 'text-neutral-500 dark:text-neutral-500',
        ]"
        transition="all duration-200 ease-in-out"
      >
        {{ title }}
      </span>
      <span
        v-if="description"
        class="radio-item-description"
        :class="[
          modelValue === value
            ? 'text-neutral-600 dark:text-neutral-400'
            : 'text-neutral-400 dark:text-neutral-600',
        ]"
        transition="all duration-200 ease-in-out"
      >
        {{ description }}
      </span>
    </div>
    <div
      class="bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50 [input:checked~&]:bg-dotted-primary-300/50 dark:[input:checked~&]:bg-dotted-primary-200/20"
      absolute inset-0 z--1
      style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
    />
  </label>
</template>
