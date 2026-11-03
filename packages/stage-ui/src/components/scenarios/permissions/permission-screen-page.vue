<script setup lang="ts">
import type { DevicePermission, ScreenPreview } from '../../../stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
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
          <span
            v-else-if="selected"
            :class="['absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', 'bg-white/90 text-neutral-800 dark:bg-neutral-950/85 dark:text-neutral-100', 'animate-slideUpAndFade']"
          >
            <span :class="['size-1.75 rounded-full bg-primary-500 animate-pulse']" aria-hidden="true" />
            {{ t('settings.dialogs.onboarding.permissions.flow.screen-recording.live') }}
          </span>
        </div>

        <div
          v-if="granted && screens.length > 1"
          role="radiogroup"
          :aria-label="t('settings.dialogs.onboarding.permissions.flow.screen-recording.display')"
          :class="['flex gap-2.5', 'animate-slideUpAndFade']"
        >
          <button
            v-for="screen in screens"
            :key="screen.id"
            type="button"
            role="radio"
            :aria-checked="screen.id === selected?.id"
            :class="[
              'min-w-0 flex flex-1 items-center gap-2.5 rounded-xl p-2 text-left text-[13px] outline-none transition-colors duration-150',
              screen.id === selected?.id ? 'bg-white dark:bg-neutral-800' : 'hover:bg-white/60 dark:hover:bg-neutral-800/50',
            ]"
            @click="selectedId = screen.id"
          >
            <img :src="screen.imageUrl" alt="" :class="['h-7 w-11 shrink-0 rounded object-cover', screen.id === selected?.id ? 'ring-2 ring-primary-500' : '']">
            <span :class="['truncate']">{{ screen.name }}</span>
          </button>
        </div>
      </div>
    </template>
  </PermissionPageLayout>
</template>
