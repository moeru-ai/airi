<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AudioTrackVisualizer from '../../gadgets/audio-track-visualizer.vue'

interface EvalScores {
  singer_similarity?: number
  f0_corr?: number
  naturalness_mos?: number
  overall_grade?: string
  retry_count?: number
  auto_calibrated?: boolean
}

type TrackRole = 'final' | 'converted' | 'lead' | 'backing' | 'vocals' | 'instrumental' | 'extra'

interface TrackEntry {
  id: string
  label: string
  url: string | null
  role: TrackRole
  icon: string
}

const props = defineProps<{
  finalCoverUrl?: string | null
  vocalsUrl?: string | null
  instrumentalUrl?: string | null
  convertedVocalsUrl?: string | null
  leadVocalsUrl?: string | null
  backingVocalsUrl?: string | null
  extraTracks?: Array<{ id: string, label: string, url: string }>
  evalScores?: EvalScores | null
}>()

const TRACK_ICON_MAP: Record<TrackRole, string> = {
  final: 'i-solar:music-note-slider-2-bold-duotone',
  converted: 'i-solar:soundwave-bold-duotone',
  lead: 'i-solar:user-speak-bold-duotone',
  backing: 'i-solar:users-group-rounded-bold-duotone',
  vocals: 'i-solar:microphone-3-bold-duotone',
  instrumental: 'i-solar:music-notes-bold-duotone',
  extra: 'i-solar:vinyl-bold-duotone',
}

/**
 * Dynamically build available track list from provided URLs.
 * Only tracks with a non-null URL are rendered — no disabled/grayed items.
 */
const availableTracks = computed<TrackEntry[]>(() => {
  const candidates: TrackEntry[] = [
    { id: 'final', label: 'Final Cover', url: props.finalCoverUrl ?? null, role: 'final', icon: TRACK_ICON_MAP.final },
    { id: 'converted', label: 'Converted Vocals', url: props.convertedVocalsUrl ?? null, role: 'converted', icon: TRACK_ICON_MAP.converted },
    { id: 'lead', label: 'Lead Vocals', url: props.leadVocalsUrl ?? null, role: 'lead', icon: TRACK_ICON_MAP.lead },
    { id: 'backing', label: 'Backing Vocals', url: props.backingVocalsUrl ?? null, role: 'backing', icon: TRACK_ICON_MAP.backing },
    { id: 'vocals', label: 'Original Vocals', url: props.vocalsUrl ?? null, role: 'vocals', icon: TRACK_ICON_MAP.vocals },
    { id: 'instrumental', label: 'Instrumental', url: props.instrumentalUrl ?? null, role: 'instrumental', icon: TRACK_ICON_MAP.instrumental },
  ]

  if (props.extraTracks) {
    for (const extra of props.extraTracks) {
      candidates.push({
        id: extra.id,
        label: extra.label,
        url: extra.url,
        role: 'extra',
        icon: TRACK_ICON_MAP.extra,
      })
    }
  }

  return candidates.filter(t => t.url != null)
})

const activeTrackId = ref('final')

watch(availableTracks, (newTracks) => {
  if (newTracks.length > 0 && !newTracks.some(t => t.id === activeTrackId.value)) {
    activeTrackId.value = newTracks[0].id
  }
})

const activeTrack = computed(() => availableTracks.value.find(t => t.id === activeTrackId.value))
const activeUrl = computed(() => activeTrack.value?.url ?? null)

function downloadTrack() {
  if (!activeUrl.value)
    return
  const a = document.createElement('a')
  a.href = activeUrl.value
  a.download = `${activeTrack.value?.label ?? 'audio'}.wav`
  a.click()
}
</script>

<template>
  <div :class="['border border-green-200 rounded-xl p-4 dark:border-green-800/50']">
    <div :class="['mb-3 flex items-center justify-between']">
      <div :class="['flex items-center gap-2']">
        <div class="i-solar:check-circle-bold-duotone text-lg text-green-500" />
        <span :class="['text-sm text-green-700 font-medium dark:text-green-400']">Processing Complete</span>
      </div>
      <div v-if="evalScores?.overall_grade" :class="['flex items-center gap-2']">
        <span
          v-if="evalScores.retry_count != null && evalScores.retry_count > 0"
          :class="['rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 font-medium', 'dark:bg-amber-900/30 dark:text-amber-400']"
        >
          {{ evalScores.retry_count }} retries
        </span>
        <span
          :class="[
            'rounded-lg px-2 py-0.5 text-sm font-bold',
            {
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': evalScores.overall_grade === 'A',
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': evalScores.overall_grade === 'B',
              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': evalScores.overall_grade === 'C',
              'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400': evalScores.overall_grade === 'D',
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': evalScores.overall_grade === 'F',
            },
          ]"
        >
          {{ evalScores.overall_grade }}
        </span>
      </div>
    </div>

    <!-- Quality Scores -->
    <div
      v-if="evalScores?.singer_similarity != null"
      :class="[
        'grid grid-cols-3 mb-3 gap-2 rounded-lg p-2.5',
        'border border-neutral-100 bg-neutral-50',
        'dark:border-neutral-800 dark:bg-neutral-900/50',
      ]"
    >
      <div class="text-center">
        <div :class="['text-xs text-neutral-400 dark:text-neutral-500']">
          Identity
        </div>
        <div
          :class="[
            'text-sm font-semibold',
            (evalScores.singer_similarity ?? 0) >= 0.65
              ? 'text-green-600 dark:text-green-400'
              : 'text-amber-600 dark:text-amber-400',
          ]"
        >
          {{ ((evalScores.singer_similarity ?? 0) * 100).toFixed(0) }}%
        </div>
      </div>
      <div class="text-center">
        <div :class="['text-xs text-neutral-400 dark:text-neutral-500']">
          F0 Corr
        </div>
        <div
          :class="[
            'text-sm font-semibold',
            (evalScores.f0_corr ?? 0) >= 0.85
              ? 'text-green-600 dark:text-green-400'
              : 'text-amber-600 dark:text-amber-400',
          ]"
        >
          {{ ((evalScores.f0_corr ?? 0) * 100).toFixed(0) }}%
        </div>
      </div>
      <div class="text-center">
        <div :class="['text-xs text-neutral-400 dark:text-neutral-500']">
          MOS
        </div>
        <div
          :class="[
            'text-sm font-semibold',
            (evalScores.naturalness_mos ?? 0) >= 3.0
              ? 'text-green-600 dark:text-green-400'
              : 'text-amber-600 dark:text-amber-400',
          ]"
        >
          {{ (evalScores.naturalness_mos ?? 0).toFixed(1) }}
        </div>
      </div>
    </div>

    <!-- Track Selector (dynamic: only available tracks rendered) -->
    <div :class="['mb-3 flex gap-1.5 overflow-x-auto']">
      <button
        v-for="track in availableTracks"
        :key="track.id"
        :class="[
          'flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          activeTrackId === track.id
            ? 'bg-primary-500 text-white shadow-sm'
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700',
        ]"
        @click="activeTrackId = track.id"
      >
        <div :class="track.icon" class="text-sm" />
        <span>{{ track.label }}</span>
      </button>
    </div>

    <!-- Audio Visualizer -->
    <div v-if="activeUrl" :class="['space-y-2']">
      <AudioTrackVisualizer
        :key="activeUrl"
        :audio-url="activeUrl"
      />
      <div :class="['flex justify-end']">
        <button
          :class="[
            'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
            'dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700',
          ]"
          @click="downloadTrack"
        >
          <div class="i-solar:download-bold-duotone text-sm" />
          <span>Download</span>
        </button>
      </div>
    </div>
    <div v-else :class="['flex items-center gap-2 py-4 text-sm text-neutral-400']">
      <div class="i-solar:music-note-slider-bold-duotone" />
      <span>No audio available for this track.</span>
    </div>
  </div>
</template>
