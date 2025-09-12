<script setup lang="ts">
defineProps<{
  providerName: string
  providerIcon?: string
  providerIconColor?: string
  onBack?: () => void
}>()
</script>

<template>
  <slot />
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
  >
    <!-- If providerIcon is a URL or a local image path (starts with http, /, ./ or ends with an image extension), render it as an image. Otherwise treat it as a CSS/icon class. -->
    <template v-if="providerIcon && typeof providerIcon === 'string' && (providerIcon.startsWith('http') || providerIcon.startsWith('/') || providerIcon.startsWith('./') || providerIcon.match(/\.(png|jpe?g|svg|webp|avif)$/i))">
      <!-- Larger, responsive provider icon for settings page -->
      <img
        :src="providerIcon"
        alt="provider icon"
        class="rounded-lg"
        style="object-fit:contain; position:absolute; right:-1.25rem; bottom:-1.25rem; width:15rem; height:15rem; opacity:0.12; filter:grayscale(100%);"
      >
    </template>
    <template v-else>
      <div text="60" :class="providerIcon || providerIconColor" />
    </template>
  </div>
</template>
