<script setup lang="ts">
import type { DevicePermission } from '../../../../stores/device-permissions'
import type { PermissionStepItem } from '../../permissions/permission-steps.vue'
import type { OnboardingStepLaterHandler, OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionBasicPage from '../../permissions/permission-basic-page.vue'
import PermissionMicrophonePage from '../../permissions/permission-microphone-page.vue'
import PermissionScreenPage from '../../permissions/permission-screen-page.vue'
import PermissionShortcutPage from '../../permissions/permission-shortcut-page.vue'
import PermissionSteps from '../../permissions/permission-steps.vue'
import PermissionSummary from '../../permissions/permission-summary.vue'

import { useDevicePermissionStatus } from '../../../../composables/permissions/use-device-permission-status'
import { useDevicePermissionsStore } from '../../../../stores/device-permissions'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious?: OnboardingStepPrevHandler
  onLater?: OnboardingStepLaterHandler
}>()

const { t } = useI18n()
const flowKey = 'settings.dialogs.onboarding.permissions.flow'
const { permissions } = storeToRefs(useDevicePermissionsStore())
const { statuses, busyId, request } = useDevicePermissionStatus(permissions)

/** The index of the shown page. The index after the last permission is the summary. */
const page = shallowRef(0)
/** The pages slide in from the side that the user moves toward. */
const direction = shallowRef<'next' | 'prev'>('next')
/** Permissions that the user skipped in this flow. The steps and the summary show them as skipped. */
const skipped = ref<Set<string>>(new Set())
/** Permissions whose request the user started. A request that opens the system settings waits until the user returns. */
const requested = ref<Set<string>>(new Set())
const microphoneHeard = shallowRef(false)
// A permission that lasts only while something runs, for example a screen share on the web, stops when the step closes.
// It does not stop on its page, so the summary still shows it as set up.
onScopeDispose(() => permissions.value.forEach(permission => permission.release?.()))

const current = computed<DevicePermission | undefined>(() => permissions.value[page.value])
const onSummary = computed(() => page.value >= permissions.value.length)

function isGranted(permission: DevicePermission) {
  return statuses.value[permission.id] === 'granted'
}

function isWaiting(permission: DevicePermission) {
  return requested.value.has(permission.id) && !isGranted(permission) && !!permission.settingsLocationKey
}

function stateLabelOf(permission: DevicePermission) {
  if (isGranted(permission))
    return t(`${flowKey}.state.granted`)
  return t(skipped.value.has(permission.id) ? `${flowKey}.state.skipped` : `${flowKey}.state.todo`)
}

const steps = computed<PermissionStepItem[]>(() => [
  ...permissions.value.map(permission => ({
    name: t(permission.titleKey),
    state: isGranted(permission) ? 'granted' as const : skipped.value.has(permission.id) ? 'skipped' as const : 'todo' as const,
    stateLabel: stateLabelOf(permission),
  })),
  { name: t(`${flowKey}.summary.name`), state: 'todo', stateLabel: t(`${flowKey}.state.review`) },
])

function go(index: number) {
  if (index === page.value)
    return
  direction.value = index > page.value ? 'next' : 'prev'
  page.value = index
}

function skip() {
  if (current.value)
    skipped.value = new Set([...skipped.value, current.value.id])
  go(page.value + 1)
}

/** The microphone page continues only after the check heard the user, so a broken input does not look done. */
const ready = computed(() => !!current.value && isGranted(current.value) && (current.value.kind !== 'microphone' || microphoneHeard.value))

const primaryLabel = computed(() => {
  const permission = current.value
  if (!permission)
    return t(`${flowKey}.done`)
  if (isGranted(permission))
    return t(`${flowKey}.continue`)
  if (permission.requestLabelKey)
    return t(permission.requestLabelKey)
  if (statuses.value[permission.id] === 'denied' || permission.settingsLocationKey)
    return t('settings.dialogs.onboarding.permissions.openSettingsAction')
  if (permission.kind === 'microphone')
    return t(`${flowKey}.microphone.allow`)
  return t(`${flowKey}.allow`)
})

/** A back step exists on each page after the first, and on the first page when the onboarding has an earlier step. */
const canGoBack = computed(() => page.value > 0 || !!props.onPrevious)

async function back() {
  if (page.value > 0) {
    go(page.value - 1)
    return
  }
  await props.onPrevious?.()
}

async function primary() {
  const permission = current.value
  if (!permission) {
    await props.onNext()
    return
  }
  if (ready.value) {
    go(page.value + 1)
    return
  }
  requested.value = new Set([...requested.value, permission.id])
  await request(permission)
}
</script>

<template>
  <div :class="['@container h-full flex flex-col gap-5']">
    <div :class="['h-9 flex items-center justify-between gap-4']">
      <div :class="['flex items-center gap-3.5']">
        <!-- On a narrow flow, for example on a phone or in a dialog, Back sits at the start of the top bar, as in a navigation bar. -->
        <button
          v-if="canGoBack"
          type="button"
          :aria-label="t('settings.dialogs.onboarding.back')"
          :class="['-ml-1.5 size-8 flex items-center justify-center rounded-full outline-none @3xl:hidden', 'text-neutral-600 hover:bg-neutral-900/5 dark:text-neutral-300 dark:hover:bg-white/10', 'focus-visible:ring-2 focus-visible:ring-primary-400/60']"
          @click="back"
        >
          <span :class="['i-mingcute:left-line', 'size-5']" aria-hidden="true" />
        </button>
        <PermissionSteps :steps="steps" :current="page" :label="t(`${flowKey}.steps`)" @select="go" />
        <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ steps[page]?.name }}</span>
      </div>
      <GhostButton v-if="props.onLater && !onSummary" :label="t(`${flowKey}.setUpLater`)" @click="props.onLater()" />
    </div>

    <Transition :name="direction === 'next' ? 'permission-next' : 'permission-prev'" mode="out-in">
      <PermissionSummary
        v-if="onSummary"
        key="summary"
        :permissions="permissions"
        :statuses="statuses"
        :skipped="skipped"
        @open="go"
      />
      <PermissionMicrophonePage
        v-else-if="current?.kind === 'microphone'"
        :key="current.id"
        v-model:heard="microphoneHeard"
        :granted="isGranted(current)"
      />
      <PermissionShortcutPage
        v-else-if="current?.kind === 'accessibility' || current?.kind === 'push-to-talk'"
        :key="current.id"
        :permission="current"
        :granted="isGranted(current)"
        :waiting="isWaiting(current)"
      />
      <PermissionScreenPage
        v-else-if="current?.kind === 'screen-recording'"
        :key="current.id"
        :permission="current"
        :granted="isGranted(current)"
        :waiting="isWaiting(current)"
      />
      <PermissionBasicPage
        v-else-if="current"
        :key="current.id"
        :permission="current"
        :granted="isGranted(current)"
      />
    </Transition>

    <div :class="['flex items-center justify-end gap-2.5']">
      <!-- On a wide flow, Back sits at the bottom left, across from the actions that move forward. -->
      <GhostButton
        v-if="canGoBack"
        icon="i-mingcute:left-line"
        :label="t('settings.dialogs.onboarding.back')"
        :class="['mr-auto hidden @3xl:flex']"
        @click="back"
      />
      <TooltipProvider v-if="current" :delay-duration="200">
        <TooltipRoot>
          <TooltipTrigger as-child>
            <Button variant="secondary" :label="t(`${flowKey}.skip`)" @click="skip" />
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="top"
              align="end"
              :side-offset="6"
              :class="['z-[10000] max-w-64 rounded-lg px-3 py-2 text-xs shadow-md', 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900', 'animate-slideDownAndFade']"
            >
              {{ t(`${flowKey}.${current.kind}.off`) }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </TooltipProvider>
      <Button
        variant="primary"
        color="primary"
        :label="primaryLabel"
        :loading="!!current && busyId === current.id"
        :disabled="!!current && isGranted(current) && !ready"
        @click="primary"
      />
    </div>
  </div>
</template>

<style scoped>
.permission-next-enter-active,
.permission-prev-enter-active {
  animation: permission-page-in 340ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.permission-next-leave-active,
.permission-prev-leave-active {
  animation: permission-page-out 160ms ease-in both;
}

.permission-prev-enter-active {
  --permission-from: -28px;
}

.permission-next-enter-active {
  --permission-from: 28px;
}

.permission-next-leave-active {
  --permission-to: -16px;
}

.permission-prev-leave-active {
  --permission-to: 16px;
}

@keyframes permission-page-in {
  from {
    opacity: 0;
    transform: translateX(var(--permission-from));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes permission-page-out {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateX(var(--permission-to));
  }
}

@media (prefers-reduced-motion: reduce) {
  .permission-next-enter-active,
  .permission-prev-enter-active,
  .permission-next-leave-active,
  .permission-prev-leave-active {
    animation-duration: 1ms;
  }
}
</style>
