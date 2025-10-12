<script setup lang="ts">
import { Messaging } from '@proj-airi/stage-ui/components'
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="rounded-xl bg-neutral-100 p-6 dark:bg-[rgba(0,0,0,0.3)]">
      <h2 class="mb-4 w-full text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
        <div class="inline-flex items-center gap-4">
          {{ $t('settings.pages.modules.messaging.title') }}
        </div>
      </h2>

      <div class="dark:neutral-400 text-neutral-400">
        <span>{{ $t('settings.pages.modules.messaging.description') }}</span>
      </div>

      <div class="mt-6">
        <Messaging />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
