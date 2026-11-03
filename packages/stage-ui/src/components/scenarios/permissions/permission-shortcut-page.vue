<script setup lang="ts">
import type { DevicePermission, ShortcutReach } from '../../../stores/device-permissions'

import { computed, onScopeDispose, shallowRef, watch } from 'vue'
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

/** Apple keyboards print symbols on the modifier keys, so their keycaps show the symbol too. */
const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent)
const appleSymbols: Record<string, string> = { Ctrl: '⌃', Control: '⌃', Shift: '⇧', Alt: '⌥', Option: '⌥', Cmd: '⌘', Command: '⌘' }

const keys = computed(() => (props.permission.shortcutKeys?.() ?? []).map(key => ({
  key,
  symbol: isApple ? appleSymbols[key] : undefined,
  wide: key === 'Space',
})))

const pressing = shallowRef(false)
/** Where the last press came from. It stays after the release, so the page can say whether the shortcut works in other apps. */
const lastReach = shallowRef<ShortcutReach>()
let stopListening: (() => void) | undefined

// The reach changes with the permission, so the page listens again after each change.
watch(() => props.granted, () => {
  stopListening?.()
  pressing.value = false
  lastReach.value = undefined
  stopListening = props.permission.tryShortcut?.(({ phase, reach }) => {
    pressing.value = phase === 'down'
    lastReach.value = reach
  })
}, { immediate: true })
onScopeDispose(() => stopListening?.())
</script>

<template>
  <PermissionPageLayout
    :title="t('settings.dialogs.onboarding.permissions.flow.accessibility.title')"
    :description="t('settings.dialogs.onboarding.permissions.flow.accessibility.body')"
  >
    <ul :class="['m-0 mt-1.5 flex flex-col list-none gap-2 p-0']">
      <li
        :class="[
          'flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors duration-300',
          granted ? 'bg-green-100/70 dark:bg-green-900/25' : 'bg-transparent',
        ]"
      >
        <span :class="['i-mingcute:check-circle-line', 'size-5 shrink-0', granted ? 'text-green-600 dark:text-green-400' : 'text-neutral-400 dark:text-neutral-500']" aria-hidden="true" />
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
      <div :class="['flex items-end gap-2.5']" role="img" :aria-label="keys.map(item => item.key).join(' + ')">
        <!-- A keycap is a base with a face on top. A press moves the face down into the base. -->
        <span
          v-for="item in keys"
          :key="item.key"
          :class="[
            'h-19.5 flex rounded-[14px] pb-1.5 transition-colors duration-100',
            item.wide ? 'w-42' : 'w-21.5',
            pressing ? 'bg-primary-500 dark:bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-950',
          ]"
        >
          <span
            :class="[
              'flex flex-1 flex-col items-start justify-between rounded-xl px-3 py-2.5 transition-[transform,background-color,color] duration-75 ease-out',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
              pressing
                ? 'translate-y-1 bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-100'
                : 'bg-neutral-50 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100',
            ]"
          >
            <span :class="['text-xl leading-none font-medium']">{{ item.symbol ?? '' }}</span>
            <span :class="['text-xs leading-none opacity-75']">{{ item.key }}</span>
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
        <PermissionStatusLine v-else-if="lastReach === 'every-app'" tone="ok">
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.worksEverywhere') }}
        </PermissionStatusLine>
        <PermissionStatusLine v-else-if="lastReach === 'this-app'" tone="info">
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.worksHere') }}
        </PermissionStatusLine>
        <span v-else :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.permissions.flow.accessibility.try') }}
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
