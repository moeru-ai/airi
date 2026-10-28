<script setup lang="ts">
import type { ReleaseTimelineMode } from '../components/release-timeline'

import { useSceneReady } from '@vishot/mockup-desktop-vue'
import { computed, provide } from 'vue'
import { useRoute } from 'vue-router'

import ReleaseThemeScope from '../components/release-theme-scope.vue'
import AreaAvatars from './components/area-avatars.vue'
import AreaCover from './components/area-cover.vue'
import AreaDesktop from './components/area-desktop.vue'
import AreaLive2d from './components/area-live2d.vue'
import AreaStickers from './components/area-stickers.vue'
import AreaToolCalls from './components/area-tool-calls.vue'
import AreaVoice from './components/area-voice.vue'
import AreaWebMobile from './components/area-web-mobile.vue'

import { releaseThemes } from '../components/release-theme'
import { releaseTimelineKey } from '../components/release-timeline'
import { releaseShotSources } from './components/release-shots'

/**
 * The v0.12 release areas, in reading order.
 *
 * - `?area=<name>` shows one area, for example `?area=release-v0-12-voice`.
 * - `?theme=dark` or `?theme=light` shows one theme. Without it, the page shows both.
 * - `?play` plays the entry timeline of each shown area. Record the page to get a video.
 */
const areas = [
  { name: 'release-v0-12-cover', component: AreaCover },
  { name: 'release-v0-12-avatars', component: AreaAvatars },
  { name: 'release-v0-12-live2d', component: AreaLive2d },
  { name: 'release-v0-12-tool-calls', component: AreaToolCalls },
  { name: 'release-v0-12-voice', component: AreaVoice },
  { name: 'release-v0-12-desktop', component: AreaDesktop },
  { name: 'release-v0-12-web-mobile', component: AreaWebMobile },
  { name: 'release-v0-12-stickers', component: AreaStickers },
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
  title: Release v0.12
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
