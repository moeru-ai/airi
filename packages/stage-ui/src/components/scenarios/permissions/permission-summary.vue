<script setup lang="ts">
import type { DevicePermission, DevicePermissionStatus } from '../../../stores/device-permissions'

import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { permissionIcons } from './permission-icons'

const props = defineProps<{
  permissions: readonly DevicePermission[]
  statuses: Record<string, DevicePermissionStatus>
  skipped: ReadonlySet<string>
}>()

const emit = defineEmits<{
  /** The user wants to set up the permission at this index. */
  open: [index: number]
}>()

const { t } = useI18n()

function detailOf(permission: DevicePermission) {
  const flowKey = `settings.dialogs.onboarding.permissions.flow.${permission.kind}`
  if (props.statuses[permission.id] === 'granted')
    return t(`${flowKey}.on`)
  const consequence = t(`${flowKey}.off`)
  return props.skipped.has(permission.id) ? t('settings.dialogs.onboarding.permissions.flow.summary.skipped', { consequence }) : consequence
}
</script>

<template>
  <div :class="['@container min-h-0 flex flex-1 flex-col']">
    <!-- No comment before this root, as in the page layout. A narrow page stacks and centers the parts. -->
    <div :class="['min-h-0 flex flex-1 flex-col items-center justify-center gap-6 text-center @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] @3xl:items-center @3xl:gap-12 @3xl:text-left']">
      <div :class="['flex flex-col gap-3.5']">
        <h2 :class="['m-0 text-2xl text-neutral-900 font-bold leading-tight @3xl:text-3xl dark:text-neutral-50']">
          {{ permissions.every(permission => statuses[permission.id] === 'granted') ? t('settings.dialogs.onboarding.permissions.flow.summary.title') : t('settings.dialogs.onboarding.permissions.flow.summary.almost') }}
        </h2>
        <p :class="['m-0 text-[15px] text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.permissions.flow.summary.body') }}
        </p>
      </div>
      <ul :class="['m-0 max-w-105 w-full flex flex-col list-none gap-2 p-0 text-left']">
        <li
          v-for="(permission, index) in permissions"
          :key="permission.id"
          :class="['flex items-center gap-3.5 rounded-2xl px-4 py-3.5', 'bg-neutral-100 dark:bg-neutral-800/50', 'animate-slideUpAndFade']"
          :style="{ animationDelay: `${index * 70}ms`, animationFillMode: 'both' }"
        >
          <span
            :class="[
              'size-9 shrink-0 flex items-center justify-center rounded-full',
              statuses[permission.id] === 'granted'
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/70 dark:text-primary-200'
                : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
            ]"
          >
            <span :class="[permissionIcons[permission.kind], 'size-4.5']" aria-hidden="true" />
          </span>
          <span :class="['min-w-0 flex flex-1 flex-col gap-0.5']">
            <span :class="['text-[15px] font-semibold']">{{ t(permission.titleKey) }}</span>
            <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ detailOf(permission) }}</span>
          </span>
          <span
            v-if="statuses[permission.id] === 'granted'"
            role="img"
            :aria-label="t('settings.dialogs.onboarding.permissions.stateGranted')"
            :class="['i-mingcute:check-circle-fill', 'size-5.5 shrink-0 text-green-600 dark:text-green-400']"
          />
          <Button
            v-else
            size="sm"
            :label="t('settings.dialogs.onboarding.permissions.flow.summary.setUp')"
            :aria-label="t('settings.dialogs.onboarding.permissions.flow.summary.setUpOne', { permission: t(permission.titleKey) })"
            @click="emit('open', index)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
