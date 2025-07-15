<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useElementSize } from '@vueuse/core'
import { ref, watchEffect } from 'vue'

const el = ref<HTMLElement>()
const { height } = useElementSize(el)

watchEffect(() => {
  if (height.value) {
    document.documentElement.style.setProperty(
      '--vp-layout-top-height',
      `${height.value || 40}px`,
    )
  }
})
</script>

<template>
  <div
    ref="el"
    class="fixed inset-0 z-[10000] h-11 w-full flex items-center justify-center from-teal9 to-green9 bg-gradient-to-r"
  >
    <h4 class="text-sm font-semibold">
      <a
        href="https://reka-ui.com/"
        target="_blank"
        class="group inline-flex items-center gap-2 hover:underline"
      >
        Check out v2! <Icon
          class="text-lg transition group-hover:translate-x-1"
          icon="lucide:arrow-right"
        />
      </a>
    </h4>
  </div>
</template>
