<script setup lang="ts">
import { IconButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { useWindowControls } from '../../composables/use-window-controls'

const { t } = useI18n()
const { state, minimize, toggleMaximize, close } = useWindowControls()

const buttonClasses = [
  'h-full w-11.5 rounded-none active:scale-100!',
  'text-neutral-600 dark:text-neutral-300',
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500',
]
</script>

<template>
  <div
    v-if="state && !state.systemControls"
    data-testid="window-controls"
    :class="['h-full flex shrink-0 [-webkit-app-region:no-drag]']"
  >
    <IconButton
      v-if="state.minimizable"
      type="button"
      icon="i-ph:minus"
      :aria-label="t('tamagotchi.stage.window.minimize')"
      :title="t('tamagotchi.stage.window.minimize')"
      :class="[buttonClasses, 'hover:bg-neutral-500/15']"
      @click="minimize()"
    />
    <IconButton
      v-if="state.maximizable"
      type="button"
      :icon="state.maximized ? 'i-ph:copy' : 'i-ph:square'"
      :aria-label="t(state.maximized ? 'tamagotchi.stage.window.restore' : 'tamagotchi.stage.window.maximize')"
      :title="t(state.maximized ? 'tamagotchi.stage.window.restore' : 'tamagotchi.stage.window.maximize')"
      :class="[buttonClasses, 'hover:bg-neutral-500/15']"
      @click="toggleMaximize()"
    />
    <IconButton
      v-if="state.closable"
      type="button"
      icon="i-ph:x"
      :aria-label="t('tamagotchi.stage.window.close')"
      :title="t('tamagotchi.stage.window.close')"
      :class="[buttonClasses, 'hover:bg-red-600 hover:text-white dark:hover:text-white']"
      @click="close()"
    />
  </div>
</template>
