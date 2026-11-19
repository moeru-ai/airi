<script setup lang="ts">
import Wip from './wip.vue'
</script>

<template>
  <Story title="Work in progress" group="misc">
    <Variant id="default" title="Default">
      <Wip :class="['m-4']" />
    </Variant>
  </Story>
</template>
