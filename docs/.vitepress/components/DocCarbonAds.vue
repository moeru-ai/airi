<script setup lang="ts">
import { useData } from 'vitepress'
import { onMounted, ref, watch } from 'vue'

const { page, theme } = useData()
const carbonOptions = theme.value.carbonAds
const container = ref()

let isInitialized = false

function init() {
  if (!isInitialized) {
    isInitialized = true
    const s = document.createElement('script')
    s.id = '_carbonads_js'
    s.src = `//cdn.carbonads.com/carbon.js?serve=${carbonOptions.code}&placement=${carbonOptions.placement}`
    s.async = true
    container.value.appendChild(s)
  }
}

watch(() => page.value.relativePath, () => {
  if (isInitialized) {
    ;(window as any)._carbonads?.refresh()
  }
})

// no need to account for option changes during dev, we can just
// refresh the page
if (carbonOptions) {
  onMounted(() => {
    if (import.meta.env.DEV)
      return

    // if the page is loaded when aside is active, load carbon directly.
    // otherwise, only load it if the page resizes to wide enough. this avoids
    // loading carbon at all on mobile where it's never shown
    init()
  })
}
</script>

<template>
  <div
    ref="container"
    class="carbon-ads"
  />
</template>

<style scoped>
.carbon-ads {
  @apply w-full flex justify-center items-center p-2 rounded-xl min-h-[256px] text-center leading-[18px] text-xs font-medium bg-white/30 dark:bg-neutral-900/30 backdrop-blur-md border border-muted;
}

.carbon-ads :deep(img) {
  @apply mx-auto rounded-md;
}

.carbon-ads :deep(.carbon-text) {
  @apply block mx-auto pt-3 text-[var(--vp-carbon-ads-text-color)] transition-colors duration-200;
}

.carbon-ads :deep(.carbon-text:hover) {
  @apply text-[var(--vp-carbon-ads-hover-text-color)];
}

.carbon-ads :deep(.carbon-poweredby) {
  @apply block pt-1.5 text-[11px] font-medium text-[var(--vp-carbon-ads-poweredby-color)] uppercase transition-colors duration-200;
}

.carbon-ads :deep(.carbon-poweredby:hover) {
  @apply text-[var(--vp-carbon-ads-hover-poweredby-color)];
}

.carbon-ads :deep(> div) {
  @apply hidden;
}

.carbon-ads :deep(> div:first-of-type) {
  @apply block;
}
</style>
