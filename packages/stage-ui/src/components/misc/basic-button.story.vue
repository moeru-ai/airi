<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { shallowRef } from 'vue'

const clicks = shallowRef(0)
</script>

<template>
  <Story title="Basic Button" group="misc">
    <Variant id="sizes" title="Sizes and caller surface">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <BasicButton v-for="size in ['sm', 'md', 'lg'] as const" :key="size" :size="size" :label="size" :class="['rounded-lg bg-primary-100 dark:bg-primary-900']" @click="clicks++" />
        <p>Clicks: {{ clicks }}</p>
      </div>
    </Variant>
    <Variant id="states" title="Icon, loading, and disabled">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <BasicButton label="Save" icon="i-solar:diskette-linear" />
        <BasicButton label="Saving" loading />
        <BasicButton label="Unavailable" disabled />
      </div>
    </Variant>
  </Story>
</template>
