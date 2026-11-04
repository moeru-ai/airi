<script setup lang="ts">
import type { DevicePermission } from '../../../stores/device-permissions'

import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionPageLayout from './permission-page-layout.vue'
import PermissionStatusLine from './permission-status-line.vue'

import { useShortcutKeys } from '../../../composables/permissions/use-shortcut-keys'

const props = defineProps<{
  permission: DevicePermission
  granted: boolean
  /** True after the user opened the system settings, until the permission is granted. */
  waiting: boolean
}>()

const { t } = useI18n()

/**
 * True for a key that works only while the app is in front, for example on the web. It needs no permission, so the
 * page does not compare a global hook with a hook of this window, and a press in this window is the whole result.
 */
const inApp = computed(() => props.permission.kind === 'push-to-talk')
const copyKey = computed(() => `settings.dialogs.onboarding.permissions.flow.${inApp.value ? 'push-to-talk' : 'accessibility'}`)

/** Each keycap moves with its key in this window, so the user sees each key as it goes down. */
const { keycaps, held, allHeld } = useShortcutKeys(() => props.permission.shortcutKeys?.() ?? [])

/** True while the global hook reports the shortcut as held. It also reports presses in other apps. */
const globalHeld = shallowRef(false)
/** True when the global hook saw the current or the last press. */
const globalSaw = shallowRef(false)
/** The result of the last full press, after the release. */
const lastResult = shallowRef<'every-app' | 'this-app'>()

const pressing = computed(() => allHeld.value || globalHeld.value)

watch(pressing, (isPressing, wasPressing) => {
  if (isPressing && !wasPressing) {
    globalSaw.value = globalHeld.value
    lastResult.value = undefined
    return
  }
  // The global hook can report a press a moment after the keys of the window. The result waits for the release.
  if (!isPressing && wasPressing)
    lastResult.value = globalSaw.value ? 'every-app' : 'this-app'
// A short tap holds the keys for less than one render, so the watcher runs at once and does not miss it.
}, { flush: 'sync' })

let stopListening: (() => void) | undefined
// The global hook works only with the permission, so the page listens again after each change.
watch(() => props.granted, () => {
  stopListening?.()
  globalHeld.value = false
  lastResult.value = undefined
  stopListening = props.permission.tryShortcut?.(({ phase }) => {
    globalHeld.value = phase === 'down'
    if (phase === 'down')
      globalSaw.value = true
  })
}, { immediate: true })
onScopeDispose(() => stopListening?.())
</script>

<template>
  <PermissionPageLayout
    :title="t(`${copyKey}.title`)"
    :description="t(`${copyKey}.body`)"
  >
    <ul v-if="!inApp" :class="['m-0 flex flex-col list-none gap-2 p-0']">
      <li
        :class="[
          'flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors duration-300',
          granted ? 'bg-neutral-100 dark:bg-neutral-800/60' : 'bg-transparent',
        ]"
      >
        <span :class="[granted ? 'i-mingcute:check-circle-fill text-green-600 dark:text-green-400' : 'i-mingcute:check-circle-line text-neutral-400 dark:text-neutral-500', 'size-5 shrink-0']" aria-hidden="true" />
        <span :class="['flex flex-col gap-0.5']">
          <span :class="['text-sm font-semibold']">{{ t('settings.dialogs.onboarding.permissions.flow.accessibility.with') }}</span>
          <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ t('settings.dialogs.onboarding.permissions.flow.accessibility.withBody') }}</span>
        </span>
      </li>
      <li
        :class="[
          'flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors duration-300',
          granted ? 'bg-transparent' : 'bg-neutral-100 dark:bg-neutral-800/60',
        ]"
      >
        <span :class="['i-mingcute:minus-circle-line', 'size-5 shrink-0 text-neutral-400 dark:text-neutral-500']" aria-hidden="true" />
        <span :class="['flex flex-col gap-0.5']">
          <span :class="['text-sm font-semibold']">{{ t('settings.dialogs.onboarding.permissions.flow.accessibility.without') }}</span>
          <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ t('settings.dialogs.onboarding.permissions.flow.accessibility.withoutBody') }}</span>
        </span>
      </li>
    </ul>
    <PermissionStatusLine v-if="waiting && permission.settingsLocationKey" tone="busy">
      {{ t(permission.settingsLocationKey) }}
    </PermissionStatusLine>

    <template #stage>
      <div :class="['flex items-end gap-2.5']" role="img" :aria-label="keycaps.map(keycap => keycap.name).join(' + ')">
        <!--
          A space bar is as tall as a letter key and much wider, as on a real keyboard. Control, Shift, and Space still fit the stage.
          A keycap is a face with its depth drawn below it as a solid shadow. A press moves the face down by that depth
          and removes the shadow, so the key sinks flush without an edge above or below. The pressed face is lighter.
        -->
        <span
          v-for="keycap in keycaps"
          :key="keycap.token"
          :class="['h-16 flex pb-1.5 @3xl:h-19.5', keycap.wide ? 'w-44' : 'w-16 @3xl:w-21.5']"
        >
          <span
            :class="[
              'flex flex-1 flex-col rounded-xl px-3 py-2.5 transition-[transform,box-shadow,background-color,color] duration-75 ease-out',
              keycap.symbol ? 'justify-between' : 'items-center justify-center',
              pressing || held.has(keycap.token)
                ? [
                  'translate-y-1.5',
                  'bg-primary-100 text-primary-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
                  'dark:bg-primary-700 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]',
                ]
                : [
                  'bg-neutral-50 text-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_0_#d4d4d4]',
                  'dark:bg-neutral-800 dark:text-neutral-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_0_#0a0a0a]',
                ],
            ]"
          >
            <!-- Apple keyboards print the symbol at the top right and the name at the bottom left. A key without a symbol centers its name. -->
            <template v-if="keycap.symbol">
              <span :class="['self-end text-lg leading-none font-[system-ui,-apple-system,sans-serif]']">{{ keycap.symbol }}</span>
              <span :class="['self-start text-xs leading-none opacity-75']">{{ keycap.name }}</span>
            </template>
            <span v-else :class="['text-sm leading-none opacity-75']">{{ keycap.name }}</span>
          </span>
        </span>
      </div>

      <div :class="['mt-7 h-10 flex items-center']">
        <span
          v-if="pressing"
          role="status"
          :class="['flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-semibold', 'bg-primary-100 text-primary-700 dark:bg-primary-900/70 dark:text-primary-100', 'animate-slideUpAndFade']"
        >
          <span :class="['h-4 flex items-center gap-0.75']" aria-hidden="true">
            <span v-for="delay in [0, -200, -400, -100]" :key="delay" :class="['permission-wave h-4 w-0.75 rounded-full bg-current']" :style="{ animationDelay: `${delay}ms` }" />
          </span>
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.listening') }}
        </span>
        <PermissionStatusLine v-else-if="inApp && lastResult" tone="ok">
          {{ t('settings.dialogs.onboarding.permissions.flow.push-to-talk.works') }}
        </PermissionStatusLine>
        <PermissionStatusLine v-else-if="lastResult === 'every-app'" tone="ok">
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.worksEverywhere') }}
        </PermissionStatusLine>
        <PermissionStatusLine v-else-if="lastResult === 'this-app'" tone="info">
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.worksHere') }}
        </PermissionStatusLine>
        <span v-else :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">
          {{ t(`${copyKey}.try`) }}
        </span>
      </div>
    </template>
  </PermissionPageLayout>
</template>

<style scoped>
.permission-wave {
  animation: permission-wave 700ms ease-in-out infinite;
}

@keyframes permission-wave {
  0%,
  100% {
    transform: scaleY(0.3);
  }
  50% {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .permission-wave {
    animation: none;
  }
}
</style>
