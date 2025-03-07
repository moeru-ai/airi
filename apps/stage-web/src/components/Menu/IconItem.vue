<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
  iconTemplate?: boolean
  to: string
}>()
</script>

<template>
  <RouterLink
    flex="~ row" bg="neutral-50 dark:neutral-800"
    border="neutral-100 dark:neutral-700 hover:pink-300 dark:hover:pink-300/40 solid 2"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    class="[&_.settings-section-icon]:hover:scale-120 [&_.settings-section-description]:hover:text-pink-400/80 [&_.settings-section-icon]:hover:text-pink-200 [&_.settings-section-title]:hover:text-pink-500 dark:[&_.settings-section-icon]:hover:text-pink-200/40 dark:[&_.settings-section-title]:hover:text-pink-400"
    transition="all ease-in-out duration-200" relative w-full items-center overflow-hidden rounded-lg p-5 text-left
    :to="to"
  >
    <div z-1 flex-1>
      <div text-lg font-bold class="settings-section-title" transition="all ease-in-out duration-200">
        {{ title }}
      </div>
      <div
        text="sm neutral-500 dark:neutral-400" class="settings-section-description"
        transition="all ease-in-out duration-200"
      >
        <span>{{ description }}</span>
      </div>
    </div>
    <template v-if="typeof icon === 'string'">
      <div
        class="settings-section-icon" transition="all ease-in-out duration-500" absolute right-0 size-24
        translate-y-4 text="neutral-400/50 dark:neutral-600/50" :class="[icon]"
      />
    </template>
    <template v-if="iconTemplate">
      <slot name="icon" />
    </template>
  </RouterLink>
</template>
