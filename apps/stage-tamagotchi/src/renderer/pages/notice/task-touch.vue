<script setup lang="ts">
import type { TouchAction, TouchEventPayload } from '@proj-airi/server-sdk-shared'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { progressPhraseFrom } from '@proj-airi/stage-ui/utils/progress-language'
import { Button, TransitionVertical } from '@proj-airi/ui'
import { refDebounced, useMouseInElement } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { noticeTaskTouchAction, noticeWindowEventa } from '../../../shared/eventa'

const context = useElectronEventaContext()
const sendTouchAction = useElectronEventaInvoke(noticeTaskTouchAction, context.value)
const notifyMounted = useElectronEventaInvoke(noticeWindowEventa.pageMounted, context.value)
const notifyUnmounted = useElectronEventaInvoke(noticeWindowEventa.pageUnmounted, context.value)
const route = useRoute()
const { t, locale } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`tamagotchi.stage.notice.task-touch.${key}`, params ?? {})

const requestId = ref<string | null>(null)
const touch = ref<TouchEventPayload>()

const containerRef = ref<HTMLDivElement>()
const { isOutside } = useMouseInElement(containerRef)
// Hovering keeps the toast around and expands the action row, mirroring
// the established fade-on-hover notice behavior.
const expanded = refDebounced(computed(() => !isOutside.value), 80)

const phrase = computed(() => {
  if (!touch.value)
    return undefined
  return progressPhraseFrom(touch.value.message, { locale: locale.value, now: new Date() })
})

const headline = computed(() => {
  if (!phrase.value)
    return tn('waiting')
  const { remaining, eta, isOffTrack } = phrase.value
  if (!remaining)
    return tn('progress.in-progress')
  if (eta) {
    return isOffTrack
      ? tn('progress.off-track-eta', { remaining, eta })
      : tn('progress.remaining-eta', { remaining, eta })
  }
  return remaining
})

const availableActions = computed<TouchAction[]>(() => {
  const offered = touch.value?.actions ?? []
  const renderable: TouchAction[] = ['ack', 'details', 'mute_task']
  return renderable.filter(action => offered.includes(action))
})

const ACTION_ICON: Partial<Record<TouchAction, string>> = {
  ack: 'i-solar:check-circle-bold-duotone',
  details: 'i-solar:square-top-down-bold-duotone',
  mute_task: 'i-solar:bell-off-bold-duotone',
}

onMounted(async () => {
  try {
    const id = typeof route.query.id === 'string'
      ? route.query.id
      : Array.isArray(route.query.id)
        ? route.query.id[0]
        : null

    const pending = await notifyMounted({ id: id ?? undefined })
    if (pending?.id && pending.type === 'task-touch' && pending.payload) {
      requestId.value = pending.id
      touch.value = pending.payload as TouchEventPayload
    }
  }
  catch (error) {
    console.warn('Failed to notify notice window mounted:', error)
  }
})

onBeforeUnmount(async () => {
  try {
    await notifyUnmounted({ id: undefined })
  }
  catch {
    /* noop */
  }
})

async function handleAction(action: TouchAction) {
  const id = requestId.value
  if (!id) {
    window.close()
    return
  }

  try {
    await sendTouchAction({ id, action })
  }
  catch (error) {
    console.warn('Failed to notify main process of touch action:', error)
  }
  finally {
    window.close()
  }
}
</script>

<template>
  <div class="h-100dvh w-100dvw flex items-end p-3">
    <div
      ref="containerRef"
      v-motion
      :initial="{ opacity: 0, y: 12 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="350"
      :class="[
        'w-full flex flex-col gap-2 overflow-hidden',
        'rounded-lg px-4 py-3',
        'bg-white/90 text-neutral-900 dark:bg-neutral-800/90 dark:text-neutral-100',
        'backdrop-blur-sm shadow-lg',
      ]"
    >
      <div class="flex items-center gap-2">
        <div
          :class="[
            phrase?.isOffTrack ? 'i-solar:danger-triangle-bold-duotone text-orange-500' : 'i-solar:graph-up-bold-duotone text-primary-500',
            'size-4 shrink-0',
          ]"
        />
        <span class="flex-1 text-sm font-medium">{{ headline }}</span>
      </div>

      <TransitionVertical>
        <div v-if="expanded && availableActions.length" class="flex items-center gap-2 overflow-hidden pt-1">
          <Button
            v-for="action in availableActions"
            :key="action"
            :variant="action === 'ack' ? 'primary' : 'secondary'"
            size="sm"
            :icon="ACTION_ICON[action]"
            :label="tn(`actions.${action.replaceAll('_', '-')}`)"
            @click="handleAction(action)"
          />
        </div>
      </TransitionVertical>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
