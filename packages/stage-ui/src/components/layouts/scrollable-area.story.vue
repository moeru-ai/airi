<script setup lang="ts">
import { ScrollableArea } from '@proj-airi/ui'
</script>

<template>
  <Story title="Scrollable Area" group="misc">
    <Variant v-for="orientation in ['vertical', 'horizontal', 'both'] as const" :id="orientation" :key="orientation" :title="orientation">
      <ScrollableArea :orientation="orientation" type="always" :class="['m-4 h-48 w-72 rounded-lg border border-neutral-300 dark:border-neutral-700']">
        <div :class="['p-4', orientation !== 'vertical' && 'w-160']">
          <p v-for="row in 20" :key="row">
            Row {{ row }}: Scroll to inspect the remaining content.
          </p>
        </div>
      </ScrollableArea>
    </Variant>
  </Story>
</template>
