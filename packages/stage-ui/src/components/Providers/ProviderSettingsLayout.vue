<script setup lang="ts">
defineProps<{
  providerName: string
  providerIcon?: string
  providerIconColor?: string
  onBack?: () => void
}>()
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="onBack">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Provider</span>
      </div>
      <div text-3xl font-semibold>
        {{ providerName }}
      </div>
    </h1>
  </div>
  <slot />
  <div text="neutral-100/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 translate-x-10 translate-y-10>
    <div text="40" :class="providerIcon || providerIconColor" />
  </div>
</template>
