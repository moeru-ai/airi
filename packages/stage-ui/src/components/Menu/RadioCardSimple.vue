<script setup lang="ts">
defineProps<{
  id: string
  name: string
  value: string
  title: string
  description?: string
}>()

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <label
    :key="id"
    border="2px solid"
    class="form_radio-card-simple relative"
    transition="all duration-200 ease-in-out"
    :class="[
      modelValue === value
        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-100 dark:border-primary-900 hover:border-primary-500/30 dark:hover:border-primary-400/30'
        : 'bg-white dark:bg-neutral-900/20 border-neutral-100 dark:border-neutral-900 hover:border-primary-500/30 dark:hover:border-primary-400/30',
      modelValue === value
        ? 'form_radio-card-simple-active'
        : '',
    ]"
    flex="~ col"
    block min-w-50 w-fit cursor-pointer items-start rounded-xl p-4 text-left
  >
    <input
      v-model="modelValue"
      :checked="modelValue === value"
      type="radio"
      :name="name"
      :value="value"
      class="absolute opacity-0 [&:checked+div]:border-primary-500 [&:checked+div_.radio-dot]:opacity-100 dark:[&:checked+div]:border-primary-400"
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
        class="radio-item-name font-normal"
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

<style scoped>
.form_radio-card-simple {
  position: relative;
  overflow: hidden;
}

.form_radio-card-simple::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/0 to-primary-500/0 dark:from-primary-400/0 dark:to-primary-400/0';
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 25%;
  height: 100%;
  transition: all 0.35s ease-in-out;
  mask-image: linear-gradient(120deg, white 100%);
  opacity: 0;
}

.form_radio-card-simple:hover::before,
.form_radio-card-simple._hover::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent';
  width: 85%;
  opacity: 1;
}

.form_radio-card-simple-active::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent';
  width: 85%;
  opacity: 0.5;
}
</style>
