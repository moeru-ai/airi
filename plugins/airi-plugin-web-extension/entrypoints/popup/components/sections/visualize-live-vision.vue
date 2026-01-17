<script lang="ts" setup>
import type { SubtitlePayload, VideoContextPayload } from '../../../../src/shared/types'

defineProps<{
  lastVideo?: VideoContextPayload
  lastSubtitle?: SubtitlePayload
}>()
</script>

<template>
  <section :class="['rounded-2xl', 'bg-white/6', 'border', 'border-white/10', 'p-3', 'flex', 'flex-col', 'gap-3']">
    <h2 :class="['text-sm', 'font-600']">
      Live Preview
    </h2>
    <div :class="['text-xs', 'flex', 'flex-col', 'gap-2', 'leading-relaxed']">
      <div :class="['opacity-80']">
        {{ lastVideo?.title || 'No active video detected yet.' }}
      </div>
      <div v-if="lastVideo" :class="['opacity-60']">
        {{ lastVideo.channel ? `Channel: ${lastVideo.channel}` : 'Channel: unknown' }}
      </div>
      <div v-if="lastVideo?.url" :class="['opacity-50', 'break-all']">
        {{ lastVideo.url }}
      </div>
      <div v-if="lastSubtitle?.text" :class="['mt-2', 'bg-black/30', 'border', 'border-white/10', 'rounded-lg', 'p-2']">
        “{{ lastSubtitle.text }}”
      </div>
    </div>
  </section>
</template>
