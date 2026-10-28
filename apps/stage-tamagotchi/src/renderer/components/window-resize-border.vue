<script setup lang="ts">
// The flashing border that shows while the cursor is near an edge that resizes the window. The parent passes the
// corner radius of what it frames as a class.
defineOptions({ inheritAttrs: false })

defineProps<{
  shown: boolean
}>()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div v-if="shown" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        v-bind="$attrs"
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4',
        ]"
      />
    </div>
  </Transition>
</template>
