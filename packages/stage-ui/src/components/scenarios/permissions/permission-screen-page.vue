<script setup lang="ts">
import type { DevicePermission, ScreenPreview } from '../../../stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { useIntervalFn, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'

const props = defineProps<{
  permission: DevicePermission
  granted: boolean
  /** True after the user opened the system settings, until the permission is granted. */
  waiting: boolean
}>()

const { t } = useI18n()

/** How often the preview captures the screens again, so it looks live without a video stream. */
const REFRESH_MS = 1500

const screens = shallowRef<readonly ScreenPreview[]>([])
const selectedId = shallowRef<string>()
const selected = computed(() => screens.value.find(screen => screen.id === selectedId.value) ?? screens.value[0])

async function capture() {
  if (!props.granted || !props.permission.captureScreens)
    return
  try {
    screens.value = await props.permission.captureScreens()
  }
  catch (error) {
    console.error('[permissions] Failed to capture the screens:', errorMessageFrom(error))
  }
}

/** The width of the bar under the selected screen at rest, in pixels. */
const INDICATOR_WIDTH = 20
const list = useTemplateRef<HTMLElement>('list')
const indicator = useTemplateRef<HTMLElement>('indicator')
const reducedMotion = usePreferredReducedMotion()
/** The left edge of the bar at rest, in pixels from the start of the list. */
const indicatorLeft = shallowRef<number>()

// NOTICE:
// A copy of the elastic indicator of the mobile model strip, so both pickers mark a choice the same way.
// Source: `placeIndicator` in packages/stage-ui/src/components/scenarios/settings/model-settings/mobile/model-strip.vue.
// Removal condition: a shared strip indicator that both pickers use.
function placeIndicator(options: { stretch: boolean }) {
  const element = list.value?.querySelector<HTMLElement>('[aria-checked="true"]')
  const from = indicatorLeft.value
  const to = element ? element.offsetLeft + (element.offsetWidth - INDICATOR_WIDTH) / 2 : undefined
  indicatorLeft.value = to
  if (!options.stretch || from === undefined || to === undefined || from === to || reducedMotion.value === 'reduce')
    return
  // The bar first stretches over the old and the new screen, then shrinks onto the new one.
  const start = Math.min(from, to)
  const span = Math.abs(to - from) + INDICATOR_WIDTH
  indicator.value?.animate([
    { left: `${from}px`, width: `${INDICATOR_WIDTH}px`, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)' },
    { left: `${start}px`, width: `${span}px`, offset: 0.4, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' },
    { left: `${to}px`, width: `${INDICATOR_WIDTH}px` },
  ], { duration: 480 })
}

function pick(id: string) {
  selectedId.value = id
  list.value?.querySelector(`[data-screen-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

watch(() => selected.value?.id, () => placeIndicator({ stretch: true }), { flush: 'post' })
watch(() => screens.value.length, () => placeIndicator({ stretch: false }), { flush: 'post' })
useResizeObserver(list, () => placeIndicator({ stretch: false }))

const refresh = useIntervalFn(capture, REFRESH_MS, { immediate: false })
watch(() => props.granted, (granted) => {
  if (granted) {
    void capture()
    refresh.resume()
    return
  }
  refresh.pause()
  screens.value = []
}, { immediate: true })
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.permissions.flow.screen-recording.title')"
    :description="t('settings.dialogs.onboarding.permissions.flow.screen-recording.body')"
  >
    <PermissionStatusLine v-if="granted" tone="ok">
      {{ t('settings.dialogs.onboarding.permissions.flow.screen-recording.visible') }}
    </PermissionStatusLine>
    <PermissionStatusLine v-else-if="waiting && permission.settingsLocationKey" tone="busy">
      {{ t(permission.settingsLocationKey) }}
    </PermissionStatusLine>

    <template #stage>
      <div :class="['h-full w-full flex flex-col gap-3.5 p-5']">
        <div :class="['relative min-h-0 flex-1 overflow-hidden rounded-2xl', 'bg-neutral-200 dark:bg-neutral-900']">
          <img
            v-if="granted && selected"
            :src="selected.imageUrl"
            :alt="t('settings.dialogs.onboarding.permissions.flow.screen-recording.previewOf', { screen: selected.name })"
            :class="['h-full w-full object-contain', 'animate-fadeIn']"
          >
          <!-- Before access, a drawing of a desktop stands in. The real screen is never captured then. -->
          <div
            v-else
            role="img"
            :aria-label="t('settings.dialogs.onboarding.permissions.flow.screen-recording.hidden')"
            :class="['absolute inset-0 opacity-50 blur-[4px] grayscale']"
          >
            <div :class="['h-4.5 bg-white/60 dark:bg-black/30']" />
            <div :class="['absolute left-4.5 top-10 h-37.5 w-50 rounded-lg bg-white shadow-md dark:bg-neutral-700']" />
            <div :class="['absolute right-4.5 top-15 h-35 w-30 rounded-lg bg-white shadow-md dark:bg-neutral-700']" />
          </div>

          <span
            v-if="!granted"
            :class="['absolute left-1/2 top-1/2 flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] -translate-x-1/2 -translate-y-1/2', 'bg-white/90 text-neutral-700 dark:bg-neutral-950/85 dark:text-neutral-200']"
          >
            <span :class="['i-mingcute:lock-line', 'size-4']" aria-hidden="true" />
            {{ t('settings.dialogs.onboarding.permissions.flow.screen-recording.hidden') }}
          </span>
        </div>

        <!-- The screens scroll sideways when they do not fit. A short bar under the selected one marks it. -->
        <div
          v-if="granted && screens.length > 1"
          ref="list"
          role="radiogroup"
          :aria-label="t('settings.dialogs.onboarding.permissions.flow.screen-recording.display')"
          :class="['relative flex shrink-0 gap-2.5 overflow-x-auto pb-3 pt-1', 'snap-x scrollbar-none', 'animate-slideUpAndFade']"
        >
          <button
            v-for="screen in screens"
            :key="screen.id"
            type="button"
            role="radio"
            :data-screen-id="screen.id"
            :aria-checked="screen.id === selected?.id"
            :aria-label="screen.name"
            :title="screen.name"
            :class="['shrink-0 snap-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60']"
            @click="pick(screen.id)"
          >
            <img
              :src="screen.imageUrl"
              alt=""
              draggable="false"
              :class="[
                'h-14 w-22 rounded-xl object-cover transition-opacity duration-150',
                'bg-neutral-200/50 dark:bg-neutral-800/60',
                screen.id === selected?.id ? 'opacity-100' : 'opacity-60 hover:opacity-90',
              ]"
            >
          </button>
          <span
            v-if="indicatorLeft !== undefined"
            ref="indicator"
            aria-hidden="true"
            :style="{ left: `${indicatorLeft}px`, width: `${INDICATOR_WIDTH}px` }"
            :class="['absolute bottom-0.5 h-1 rounded-full', 'bg-primary-500 dark:bg-primary-400']"
          />
        </div>
      </div>
    </template>
  </PermissionPageLayout>
</template>
