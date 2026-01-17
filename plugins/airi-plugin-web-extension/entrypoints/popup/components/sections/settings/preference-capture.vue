<script lang="ts" setup>
import { Button, FieldCheckbox } from '@proj-airi/ui'

const emit = defineEmits<{
  (event: 'capture'): void
}>()
const sendPageContextModel = defineModel<boolean>('send-page-context', { required: true })
const sendVideoContextModel = defineModel<boolean>('send-video-context', { required: true })
const sendSubtitlesModel = defineModel<boolean>('send-subtitles', { required: true })
const sendSparkNotifyModel = defineModel<boolean>('send-spark-notify', { required: true })
const enableVisionModel = defineModel<boolean>('enable-vision', { required: true })
</script>

<template>
  <section :class="['rounded-2xl', 'bg-white/6', 'border', 'border-white/10', 'p-3', 'flex', 'flex-col', 'gap-3']">
    <h2 :class="['text-sm', 'font-600']">
      Capture Controls
    </h2>
    <div :class="['grid', 'grid-cols-1', 'gap-3']">
      <FieldCheckbox v-model="sendPageContextModel" label="Page context" />
      <FieldCheckbox v-model="sendVideoContextModel" label="Video context" />
      <FieldCheckbox v-model="sendSubtitlesModel" label="Subtitles" />
      <FieldCheckbox v-model="sendSparkNotifyModel" label="Notify character" />
      <FieldCheckbox v-model="enableVisionModel" label="Vision capture (manual)" />
    </div>
    <Button
      variant="secondary"
      size="sm"
      :disabled="!enableVision"
      @click="emit('capture')"
    >
      Capture frame
    </Button>
  </section>
</template>
