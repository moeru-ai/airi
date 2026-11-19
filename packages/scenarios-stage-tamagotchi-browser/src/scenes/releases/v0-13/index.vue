<script setup lang="ts">
import type { ReleaseTimelineMode } from '../components/release-timeline'

import { useSceneReady } from '@vishot/mockup-desktop-vue'
import { computed, provide } from 'vue'
import { useRoute } from 'vue-router'

import ReleaseThemeScope from '../components/release-theme-scope.vue'
import AreaCover from './components/area-cover.vue'
import AreaDesktopUpdates from './components/area-desktop-updates.vue'
import AreaFixes from './components/area-fixes.vue'
import AreaNeedsAttention from './components/area-needs-attention.vue'
import AreaSettingsSearch from './components/area-settings-search.vue'

import { releaseThemes } from '../components/release-theme'
import { releaseTimelineKey } from '../components/release-timeline'
import { releaseShotSources } from './components/release-shots'

/**
 * The v0.13 release areas, in reading order.
 *
 * - `?area=<name>` shows one area, for example `?area=release-v0-13-needs-attention`.
 * - `?theme=dark` or `?theme=light` shows one theme. Without it, the page shows both.
 * - `?play` plays the entry timeline of each shown area. Record the page to get a video.
 */
const areas = [
  { name: 'release-v0-13-cover', component: AreaCover },
  { name: 'release-v0-13-settings-search', component: AreaSettingsSearch },
  { name: 'release-v0-13-needs-attention', component: AreaNeedsAttention },
  { name: 'release-v0-13-desktop-updates', component: AreaDesktopUpdates },
  { name: 'release-v0-13-fixes', component: AreaFixes },
]

const route = useRoute()
const mode: ReleaseTimelineMode = route.query.play === undefined ? 'static' : 'play'
provide(releaseTimelineKey, mode)

const shownThemes = computed(() => releaseThemes.filter(theme => route.query.theme === undefined || route.query.theme === theme))

const shownAreas = computed(() => {
  const area = route.query.area
  return typeof area === 'string' ? areas.filter(entry => entry.name === area) : areas
})

useSceneReady(releaseShotSources)
</script>

<route lang="yaml">
meta:
  title: Release v0.13
  sceneNavigator: false
</route>

<template>
  <div :class="['h-full overflow-y-auto bg-neutral-900']">
    <div :class="['flex flex-col items-start gap-10 p-10']">
      <ReleaseThemeScope v-for="theme in shownThemes" :key="theme" :theme="theme">
        <component :is="area.component" v-for="area in shownAreas" :key="area.name" />
      </ReleaseThemeScope>
    </div>
  </div>
</template>
