<script setup lang="ts">
import { PermissionsPanel } from '@proj-airi/stage-ui/components'
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-12']">
    <p :class="['text-sm text-neutral-600', 'md:text-base dark:text-neutral-300']">
      {{ $t('settings.pages.system.permissions.description') }}
    </p>

    <PermissionsPanel />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.permissions.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
