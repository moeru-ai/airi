<script setup lang="ts">
import { Avatar } from '@proj-airi/ui'

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`
</script>

<template>
  <Story title="Avatar" group="misc">
    <Variant id="states" title="Image and fallback">
      <div :class="['flex items-center gap-4 p-4']">
        <Avatar :src="logoUrl" alt="AIRI" :class="['size-16 rounded-full']" />
        <Avatar alt="Missing image" :class="['size-16 rounded-full bg-neutral-100 dark:bg-neutral-800']" />
        <Avatar src="data:image/png;base64,invalid" alt="Failed image" :class="['size-16 rounded-full bg-neutral-100 dark:bg-neutral-800']" />
        <Avatar alt="Custom fallback" :class="['size-16 rounded-full bg-primary-100 dark:bg-primary-900']">
          <template #fallback>
            AI
          </template>
        </Avatar>
      </div>
    </Variant>
  </Story>
</template>
