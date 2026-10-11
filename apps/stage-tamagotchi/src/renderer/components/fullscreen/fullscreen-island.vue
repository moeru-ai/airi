<script setup lang="ts">
import type { MainWindowFullscreenSurface } from '../../../shared/eventa'

import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { GhostButton, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMainWindowFullscreenStore } from '../../stores/main-window-fullscreen'
import { fullscreenSurfaces } from './surfaces'

// The island of the fullscreen mode: one button for each registered surface, the everyday controls of the Controls
// Island, and the way out of the mode.
const { t } = useI18n()
const fullscreen = useMainWindowFullscreenStore()
const { surface } = storeToRefs(fullscreen)

const KEY = 'tamagotchi.stage.fullscreen-island'

const surfaces = Object.entries(fullscreenSurfaces).map(([id, definition]) => ({ id: id as MainWindowFullscreenSurface, ...definition }))

function show(id: MainWindowFullscreenSurface) {
  void fullscreen.open(id).catch(error => console.error('[Fullscreen island] Failed to show the surface:', error))
}

const profileOpen = shallowRef(false)
const profileCreating = shallowRef(false)

function manageProfiles() {
  void fullscreen.open('settings', '/settings/airi-card').catch(error => console.error('[Fullscreen island] Failed to open the cards:', error))
}

// The theme cycles light, dark, then the system theme, like the Controls Island. Each button names the next theme.
const { themeMode, switchToNextTheme } = useTheme()
const themeIcon = computed(() => ({
  light: 'i-solar:sun-2-outline',
  dark: 'i-solar:moon-outline',
  auto: 'i-lucide:contrast',
})[themeMode.value])
const themeLabel = computed(() => t({
  light: `${KEY}.switch-to-dark-mode`,
  dark: `${KEY}.switch-to-system-mode`,
  auto: `${KEY}.switch-to-light-mode`,
}[themeMode.value]))
</script>

<template>
  <div
    :class="[
      'flex flex-col items-center',
      'gap-1',
      'rounded-2xl p-1.5',
      'bg-neutral-200 dark:bg-neutral-800',
    ]"
  >
    <GhostButton
      v-for="entry in surfaces"
      :key="entry.id"
      size="unset"
      :class="['size-11']"
      :active="surface === entry.id"
      :aria-pressed="surface === entry.id"
      :aria-label="t(entry.label)"
      :title="t(entry.label)"
      @click="show(entry.id)"
    >
      <span :class="[entry.icon, 'size-5']" />
    </GhostButton>
    <div :class="['my-1 h-px w-6', 'bg-neutral-200 dark:bg-neutral-700']" />
    <ProfileSwitcherPopover
      v-model:open="profileOpen"
      v-model:creating="profileCreating"
      @manage="manageProfiles"
    >
      <template #default="{ toggle }">
        <GhostButton
          size="unset"
          :class="['size-11']"
          :active="profileOpen"
          :aria-expanded="profileOpen"
          :aria-label="t(`${KEY}.switch-profile`)"
          :title="t(`${KEY}.switch-profile`)"
          @click="toggle"
        >
          <span :class="['i-solar:emoji-funny-square-broken', 'size-5']" />
        </GhostButton>
      </template>
    </ProfileSwitcherPopover>
    <GhostButton
      size="unset"
      :class="['size-11']"
      :aria-label="themeLabel"
      :title="themeLabel"
      @click="switchToNextTheme"
    >
      <span :class="[themeIcon, 'size-5']" />
    </GhostButton>
    <div :class="['my-1 h-px w-6', 'bg-neutral-200 dark:bg-neutral-700']" />
    <GhostButton
      size="unset"
      :class="['size-11']"
      :aria-label="t(`${KEY}.exit`)"
      :title="t(`${KEY}.exit`)"
      @click="fullscreen.close()"
    >
      <span :class="['i-solar:quit-full-screen-square-linear', 'size-5']" />
    </GhostButton>
  </div>
</template>
