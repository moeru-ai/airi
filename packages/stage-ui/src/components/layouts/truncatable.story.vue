<script setup lang="ts">
import { Truncatable } from '@proj-airi/ui'
</script>

<template>
  <Story title="Truncatable" group="misc">
    <Variant id="overflow" title="Expand with click, Enter, or Space">
      <Truncatable :line-clamp="2" :class="['m-4 max-w-sm']">
        <p v-for="line in 8" :key="line">
          Line {{ line }} contains a longer description for a character configuration.
        </p>
      </Truncatable>
    </Variant>
    <Variant id="short" title="Content without overflow">
      <Truncatable :class="['m-4 max-w-sm']">
        Short content stays visible.
      </Truncatable>
    </Variant>
  </Story>
</template>
