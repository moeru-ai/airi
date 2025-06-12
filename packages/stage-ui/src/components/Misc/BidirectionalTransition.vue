<script setup lang="ts">
defineProps<{
  fromClass?: string
  activeClass?: string
  toClass?: string
}>()
</script>

<template>
  <Transition
    :enter-from-class="fromClass"
    :enter-active-class="activeClass"
    :enter-to-class="toClass"
    :leave-from-class="toClass"
    :leave-active-class="activeClass"
    :leave-to-class="fromClass"
  >
    <slot />
  </Transition>
</template>
