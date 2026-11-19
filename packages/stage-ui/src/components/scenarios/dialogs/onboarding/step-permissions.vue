<script setup lang="ts">
import type { DeviceSetupPage } from '../../../../libs/onboarding/device-setup-pages'
import type { DevicePermission } from '../../../../stores/device-permissions'
import type { PermissionStepItem } from '../../permissions/permission-steps.vue'
import type { PermissionSummaryItem } from '../../permissions/permission-summary.vue'
import type { OnboardingStepLaterHandler, OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import BlockedPage from '../../permissions/blocked-page.vue'
import PermissionBasicPage from '../../permissions/permission-basic-page.vue'
import PermissionMicrophonePage from '../../permissions/permission-microphone-page.vue'
import PermissionScreenPage from '../../permissions/permission-screen-page.vue'
import PermissionShortcutPage from '../../permissions/permission-shortcut-page.vue'
import PermissionSteps from '../../permissions/permission-steps.vue'
import PermissionSummary from '../../permissions/permission-summary.vue'
import VoiceprintPage from '../../permissions/voiceprint-page.vue'

import { useDevicePermissionStatus } from '../../../../composables/permissions/use-device-permission-status'
import { unmetRequirementsOf } from '../../../../libs/onboarding/device-setup-pages'
import { useOnboardingStore } from '../../../../stores/onboarding'
import { permissionIcons } from '../../permissions/permission-icons'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious?: OnboardingStepPrevHandler
  onLater?: OnboardingStepLaterHandler
}>()

const { t, locale } = useI18n()
const flowKey = 'settings.dialogs.onboarding.permissions.flow'
/** The permissions of the host, and the features that need them, for example the voiceprint after the microphone. */
const { deviceSetupPages: pages } = storeToRefs(useOnboardingStore())
const permissions = computed(() => pages.value.flatMap(item => item.type === 'permission' ? [item.permission] : []))
const { statuses, busyId, request } = useDevicePermissionStatus(permissions)

/** The index of the shown page. The index after the last page is the summary. */
const pageIndex = shallowRef(0)
/** The pages slide in from the side that the user moves toward. */
const direction = shallowRef<'next' | 'prev'>('next')
/** Pages that the user skipped in this flow. The steps and the summary show them as skipped. */
const skipped = ref<Set<string>>(new Set())
/**
 * Pages that the flow passed because a required page was not done. They show as skipped only while that page is
 * still not done. For example, the voiceprint shows as not set up again after the user allows the microphone.
 */
const passed = ref<Set<string>>(new Set())
/** Permissions whose request the user started. A request that opens the system settings waits until the user returns. */
const requested = ref<Set<string>>(new Set())
const microphoneHeard = shallowRef(false)
// A permission that lasts only while something runs, for example a screen share on the web, stops when the step closes.
// It does not stop on its page, so the summary still shows it as set up.
onScopeDispose(() => permissions.value.forEach(permission => permission.release?.()))

const current = computed<DeviceSetupPage | undefined>(() => pages.value[pageIndex.value])
const onSummary = computed(() => pageIndex.value >= pages.value.length)

/** A permission page is done when the system allows it. A feature page is done when the feature is set up. */
function isDone(item: DeviceSetupPage) {
  return item.type === 'permission' ? statuses.value[item.permission.id] === 'granted' : item.feature.done()
}

function unmetOf(item: DeviceSetupPage) {
  return unmetRequirementsOf(item, pages.value, isDone)
}

/** The required pages of the shown page that are not done. The flow then shows them in place of the page. */
const currentUnmet = computed(() => current.value ? unmetOf(current.value) : [])

function isSkipped(item: DeviceSetupPage) {
  return skipped.value.has(item.id) || (passed.value.has(item.id) && unmetOf(item).length > 0)
}

function isWaiting(permission: DevicePermission) {
  return requested.value.has(permission.id) && statuses.value[permission.id] !== 'granted' && !!permission.settingsLocationKey
}

/** The text that tells the user where to allow a denied permission, when the host cannot open that place. */
function deniedHintOf(permission: DevicePermission) {
  return statuses.value[permission.id] === 'denied' && permission.deniedHintKey ? t(permission.deniedHintKey) : undefined
}

function nameOf(item: DeviceSetupPage) {
  return t(item.type === 'permission' ? item.permission.titleKey : item.feature.titleKey)
}

/** The names of the pages as one phrase, for example "Microphone and Accessibility". */
function namesOf(items: readonly DeviceSetupPage[]) {
  return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(items.map(nameOf))
}

function iconOf(item: DeviceSetupPage) {
  return item.type === 'permission' ? permissionIcons[item.key] : item.feature.icon
}

/** What the user does not get without the page, for the summary and the tooltip of Skip. */
function consequenceOf(item: DeviceSetupPage) {
  return item.type === 'permission' ? t(`${flowKey}.${item.key}.off`) : t(item.feature.offKey)
}

function stateLabelOf(item: DeviceSetupPage) {
  if (isDone(item))
    return item.type === 'permission' ? t(`${flowKey}.state.granted`) : t(`${flowKey}.state.done`)
  const unmet = unmetOf(item)
  if (unmet.length > 0)
    return t(`${flowKey}.state.blocked`, { requirement: namesOf(unmet) })
  return isSkipped(item) ? t(`${flowKey}.state.skipped`) : t(`${flowKey}.state.todo`)
}

function detailOf(item: DeviceSetupPage) {
  if (isDone(item))
    return item.type === 'permission' ? t(`${flowKey}.${item.key}.on`) : t(item.feature.onKey)
  const consequence = consequenceOf(item)
  const unmet = unmetOf(item)
  if (unmet.length > 0)
    return t(`${flowKey}.summary.blocked`, { requirement: namesOf(unmet), consequence })
  return isSkipped(item) ? t(`${flowKey}.summary.skipped`, { consequence }) : consequence
}

const steps = computed<PermissionStepItem[]>(() => [
  ...pages.value.map(item => ({
    name: nameOf(item),
    state: isDone(item) ? 'granted' as const : isSkipped(item) ? 'skipped' as const : 'todo' as const,
    stateLabel: stateLabelOf(item),
  })),
  { name: t(`${flowKey}.summary.name`), state: 'todo', stateLabel: t(`${flowKey}.state.review`) },
])

const summaryItems = computed<PermissionSummaryItem[]>(() => pages.value.map(item => ({
  id: item.id,
  name: nameOf(item),
  icon: iconOf(item),
  done: isDone(item),
  doneLabel: item.type === 'permission' ? t('settings.dialogs.onboarding.permissions.stateGranted') : t(`${flowKey}.state.done`),
  detail: detailOf(item),
})))

function go(index: number) {
  if (index === pageIndex.value)
    return
  direction.value = index > pageIndex.value ? 'next' : 'prev'
  pageIndex.value = index
}

/** Moves to the next page that the user can set up. It passes each page whose required pages are not done. */
function forward() {
  let index = pageIndex.value + 1
  const passedIds = new Set(passed.value)
  while (index < pages.value.length && unmetOf(pages.value[index]).length > 0) {
    passedIds.add(pages.value[index].id)
    index++
  }
  passed.value = passedIds
  go(index)
}

function skip() {
  if (current.value)
    skipped.value = new Set([...skipped.value, current.value.id])
  forward()
}

/**
 * The page continues when it is done. The microphone page continues only after the check heard the user,
 * so a broken input does not look done.
 */
const ready = computed(() => {
  const item = current.value
  if (!item || currentUnmet.value.length > 0 || !isDone(item))
    return false
  return item.key !== 'microphone' || microphoneHeard.value
})

const primaryLabel = computed(() => {
  const item = current.value
  if (!item)
    return t(`${flowKey}.done`)
  const [requirement] = currentUnmet.value
  if (requirement)
    return t(`${flowKey}.blocked.action`, { requirement: nameOf(requirement) })
  // A feature page has its own actions on the page, for example Start recording. Continue waits until it is done.
  if (item.type === 'feature' || isDone(item))
    return t(`${flowKey}.continue`)
  const permission = item.permission
  if (permission.requestLabelKey)
    return t(permission.requestLabelKey)
  const denied = statuses.value[permission.id] === 'denied'
  if (denied && permission.deniedHintKey)
    return t(`${flowKey}.tryAgain`)
  if (denied || permission.settingsLocationKey)
    return t('settings.dialogs.onboarding.permissions.openSettingsAction')
  if (permission.kind === 'microphone')
    return t(`${flowKey}.microphone.allow`)
  return t(`${flowKey}.allow`)
})

/** Continue waits on a page that is not ready. A request or a move to a required page can always start. */
const primaryDisabled = computed(() => {
  const item = current.value
  if (!item || currentUnmet.value.length > 0)
    return false
  return (item.type === 'feature' || isDone(item)) && !ready.value
})

/** A back step exists on each page after the first, and on the first page when the onboarding has an earlier step. */
const canGoBack = computed(() => pageIndex.value > 0 || !!props.onPrevious)

async function back() {
  if (pageIndex.value > 0) {
    go(pageIndex.value - 1)
    return
  }
  await props.onPrevious?.()
}

async function primary() {
  const item = current.value
  if (!item) {
    await props.onNext()
    return
  }
  const [requirement] = currentUnmet.value
  if (requirement) {
    go(pages.value.indexOf(requirement))
    return
  }
  if (ready.value) {
    forward()
    return
  }
  if (item.type === 'permission') {
    requested.value = new Set([...requested.value, item.permission.id])
    await request(item.permission)
  }
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
        <PermissionSteps :steps="steps" :current="pageIndex" :label="t(`${flowKey}.steps`)" @select="go" />
        <span :class="['text-[13px] text-neutral-500 dark:text-neutral-400']">{{ steps[pageIndex]?.name }}</span>
      </div>
      <GhostButton v-if="props.onLater && !onSummary" :label="t(`${flowKey}.setUpLater`)" @click="props.onLater()" />
    </div>

    <Transition :name="direction === 'next' ? 'permission-next' : 'permission-prev'" mode="out-in">
      <PermissionSummary
        v-if="onSummary"
        key="summary"
        :items="summaryItems"
        @open="go"
      />
      <BlockedPage
        v-else-if="current && currentUnmet.length > 0"
        :key="`${current.id}:blocked`"
        :page="nameOf(current)"
        :requirement="namesOf(currentUnmet)"
        :icon="iconOf(current)"
      />
      <VoiceprintPage v-else-if="current?.key === 'voiceprint'" :key="current.id" />
      <PermissionMicrophonePage
        v-else-if="current?.type === 'permission' && current.key === 'microphone'"
        :key="current.id"
        v-model:heard="microphoneHeard"
        :granted="isDone(current)"
        :denied-hint="deniedHintOf(current.permission)"
      />
      <PermissionShortcutPage
        v-else-if="current?.type === 'permission' && (current.key === 'accessibility' || current.key === 'push-to-talk')"
        :key="current.id"
        :permission="current.permission"
        :granted="isDone(current)"
        :waiting="isWaiting(current.permission)"
      />
      <PermissionScreenPage
        v-else-if="current?.type === 'permission' && current.key === 'screen-recording'"
        :key="current.id"
        :permission="current.permission"
        :granted="isDone(current)"
        :waiting="isWaiting(current.permission)"
      />
      <PermissionBasicPage
        v-else-if="current?.type === 'permission'"
        :key="current.id"
        :permission="current.permission"
        :granted="isDone(current)"
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
              {{ consequenceOf(current) }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </TooltipProvider>
      <Button
        variant="primary"
        color="primary"
        :label="primaryLabel"
        :loading="current?.type === 'permission' && busyId === current.permission.id"
        :disabled="primaryDisabled"
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
