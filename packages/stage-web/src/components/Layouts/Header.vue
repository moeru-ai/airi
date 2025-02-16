<script setup lang="ts">
import DesktopSettings from '../Widgets/DesktopSettings.vue'
</script>

<template>
  <header mb-1 w-full gap-2>
    <a
      href="https://github.com/moeru-ai/airi" rel="noreferrer noopener" target="_blank" flex="~ 1" w-full items-center
      gap-2 px-2 text-nowrap text-2xl outline-none
    >
      <div i-solar:cat-outline text="[#ed869d]" />
      <div font-cute>
        <span>アイリ</span>
      </div>
    </a>
    <DesktopSettings />
  </header>
</template>
