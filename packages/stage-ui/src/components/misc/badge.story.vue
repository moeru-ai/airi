<script setup lang="ts">
import { Badge, IconButton } from '@proj-airi/ui'
</script>

<template>
  <Story title="Badge" group="misc" :layout="{ type: 'grid', width: '100%' }">
    <Variant id="counts" title="Counts and cap">
      <div :class="['flex flex-wrap items-center gap-4 text-sm text-neutral-600 dark:text-neutral-300']">
        <span :class="['flex items-center gap-2']">3 <Badge :count="3" /></span>
        <span :class="['flex items-center gap-2']">42 <Badge :count="42" /></span>
        <span :class="['flex items-center gap-2']">12345 <Badge :count="12345" /></span>
        <span :class="['flex items-center gap-2']">0 <Badge :count="0" /></span>
      </div>
    </Variant>

    <Variant id="dot" title="Dot on a trigger">
      <div :class="['flex items-center gap-6']">
        <span :class="['relative inline-flex']">
          <IconButton aria-label="Menu, 12345 unread notifications" :class="['size-11 rounded-full bg-neutral-100 dark:bg-neutral-800']">
            <span aria-hidden="true" :class="['i-solar:hamburger-menu-outline size-6']" />
          </IconButton>
          <Badge dot :class="['absolute right-1.5 top-1.5 ring-2 ring-neutral-100 dark:ring-neutral-800']" />
        </span>
      </div>
    </Variant>
  </Story>
</template>
