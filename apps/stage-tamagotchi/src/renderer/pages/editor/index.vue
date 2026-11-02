<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import WindowTitleBar from '../../components/Window/TitleBar.vue'

const { t } = useI18n()
</script>

<template>
  <main :class="['h-full w-full pt-11', 'bg-$bg-color']">
    <WindowTitleBar :title="t('tamagotchi.stage.window.titles.editor')" icon="i-solar:pen-bold" />
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
