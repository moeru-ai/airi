<script setup lang="ts">
import type { GameletViewState } from '@proj-airi/plugin-sdk-stage/gamelet/controller'

import { WhiteboardGamelet } from '@proj-airi/airi-extension-whiteboard/ui'
import { IconButton } from '@proj-airi/ui'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { officialGameletController } from '../extensions/official'

const { t } = useI18n()
const view = shallowRef<GameletViewState>({ payload: {} })
let unsubscribe: (() => void) | undefined

onMounted(() => {
  unsubscribe = officialGameletController.subscribe((state) => {
    view.value = state
  })
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<template>
  <section
    v-if="view.bindingId"
    :class="[
      'fixed inset-x-0 bottom-0 top-[env(safe-area-inset-top)] z-[200]',
      'overflow-hidden bg-neutral-100 shadow-2xl',
      'dark:bg-neutral-950',
    ]"
    role="dialog"
    aria-modal="true"
    :aria-label="t('stage.whiteboard.title')"
  >
    <IconButton
      icon="i-lucide-x"
      :aria-label="t('stage.whiteboard.close')"
      :class="['absolute', 'right-3', 'top-3', 'z-10', 'h-9', 'w-9', 'rounded-full', 'bg-black/8', 'dark:bg-white/10']"
      @click="view.bindingId && officialGameletController.close(view.bindingId)"
    />
    <WhiteboardGamelet
      :binding-id="view.bindingId"
      :controller="officialGameletController"
    />
  </section>
  <IconButton
    v-else
    icon="i-lucide-panels-top-left"
    :aria-label="t('stage.whiteboard.open')"
    :class="[
      'fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[100]',
      'h-11 w-11 rounded-full',
      'bg-primary-500 text-white shadow-lg',
    ]"
    @click="officialGameletController.open('whiteboard:main')"
  />
</template>
