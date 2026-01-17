<script lang="ts" setup>
import { Button, Callout } from '@proj-airi/ui'
import { onMounted } from 'vue'

import {
  HeaderPopup,
  PreferenceCapture,
  SettingsConnection,
  VisualizeLiveVision,
} from './components'
import { usePopupStore } from './stores'

const popup = usePopupStore()

onMounted(() => popup.init())
</script>

<template>
  <main :class="['flex', 'flex-col', 'gap-4', 'w-full']">
    <HeaderPopup :syncing="popup.syncing.value" :connected="popup.connected.value" @refresh="popup.refresh" />

    <Callout v-if="popup.lastError.value" theme="orange" label="Connection error">
      <div :class="['flex', 'items-start', 'gap-2']">
        <div :class="['flex-1', 'text-xs', 'leading-snug', 'opacity-80']">
          {{ popup.lastError.value }}
        </div>
        <Button variant="danger" size="sm" @click="popup.clearLastError">
          Clear
        </Button>
      </div>
    </Callout>

    <PreferenceCapture
      v-model:send-page-context="popup.form.sendPageContext"
      v-model:send-video-context="popup.form.sendVideoContext"
      v-model:send-subtitles="popup.form.sendSubtitles"
      v-model:send-spark-notify="popup.form.sendSparkNotify"
      v-model:enable-vision="popup.form.enableVision"
      @capture="popup.captureFrame"
    />

    <VisualizeLiveVision :last-video="popup.lastVideo.value" :last-subtitle="popup.lastSubtitle.value" />

    <SettingsConnection
      v-model:ws-url="popup.form.wsUrl"
      v-model:token="popup.form.token"
      :enabled="popup.form.enabled"
      :syncing="popup.syncing.value"
      @toggle="popup.toggle"
      @apply="popup.applySettings"
    />
  </main>
</template>
