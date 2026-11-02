<script setup lang="ts">
import type { DevicePermission } from '../../../../stores/device-permissions'
import type { OnboardingStepLaterHandler, OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionMicrophoneCheck from '../../permissions/permission-microphone-check.vue'
import MicrophonePicker from '../../settings/microphone-picker.vue'

import { useDevicePermissionStatus } from '../../../../composables/permissions/use-device-permission-status'
import { useDevicePermissionsStore } from '../../../../stores/device-permissions'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious?: OnboardingStepPrevHandler
  onLater?: OnboardingStepLaterHandler
}>()

const { t } = useI18n()
const { permissions } = storeToRefs(useDevicePermissionsStore())
const { statuses, busyId, request } = useDevicePermissionStatus(permissions)
const audioDevice = useSettingsAudioDevice()
const { selectedAudioInput, audioInputOptions, permission: microphonePermission } = storeToRefs(audioDevice)

/**
 * The flow shows one page for each permission, then a summary. `page` is the index of the shown permission.
 * The index after the last permission is the summary.
 */
const page = shallowRef(0)
/** Permissions that the user skipped in this flow. The summary shows them as skipped. */
const skipped = ref<Set<string>>(new Set())
const microphoneHeard = shallowRef(false)
const microphoneQuiet = shallowRef(false)

const microphoneGranted = computed(() => statuses.value[permissions.value.find(permission => permission.kind === 'microphone')?.id ?? ''] === 'granted')
// A user can turn the microphone off in the system settings during the flow. Then the check must hear the user again.
watch(microphoneGranted, (allowed) => {
  if (allowed)
    return
  microphoneHeard.value = false
  microphoneQuiet.value = false
})

const current = computed<DevicePermission | undefined>(() => permissions.value[page.value])
const onSummary = computed(() => page.value >= permissions.value.length)
const status = computed(() => current.value ? statuses.value[current.value.id] : undefined)
const granted = computed(() => status.value === 'granted')

/** The microphone page waits for a heard voice after access, so a page with a broken input does not look done. */
const ready = computed(() => granted.value && (current.value?.kind !== 'microphone' || microphoneHeard.value))

const copyKey = computed(() => {
  const kind = current.value?.kind
  if (kind !== 'microphone')
    return kind
  if (microphoneHeard.value)
    return 'microphone-heard'
  return granted.value ? 'microphone-testing' : 'microphone'
})

const primaryLabel = computed(() => {
  if (ready.value)
    return t('settings.dialogs.onboarding.permissions.flow.continue')
  if (granted.value)
    return t('settings.dialogs.onboarding.permissions.flow.listening')
  if (status.value === 'denied')
    return t('settings.dialogs.onboarding.permissions.openSettingsAction')
  return t('settings.dialogs.onboarding.permissions.flow.allow')
})

function next() {
  page.value += 1
}

async function primary() {
  if (!current.value)
    return
  if (ready.value) {
    next()
    return
  }
  await request(current.value)
}

function skip() {
  if (current.value)
    skipped.value = new Set([...skipped.value, current.value.id])
  next()
}

async function back() {
  if (page.value > 0) {
    page.value -= 1
    return
  }
  await props.onPrevious?.()
}

const icons: Record<DevicePermission['kind'], string> = {
  'microphone': 'i-mingcute:mic-line',
  'accessibility': 'i-mingcute:keyboard-line',
  'screen-recording': 'i-mingcute:computer-line',
  'notifications': 'i-mingcute:notification-line',
}
</script>

<template>
  <div :class="['h-full flex flex-col']">
    <div :class="['grid grid-cols-3 items-center']">
      <div>
        <button
          v-if="page > 0 || props.onPrevious"
          type="button"
          :aria-label="t('settings.dialogs.onboarding.back')"
          :class="['flex items-center p-1 text-neutral-500 outline-none dark:text-neutral-400']"
          @click="back"
        >
          <div :class="['i-mingcute:left-line', 'size-5']" />
        </button>
      </div>
      <div
        v-if="!onSummary"
        role="img"
        :aria-label="t('settings.dialogs.onboarding.permissions.flow.position', { current: page + 1, total: permissions.length })"
        :class="['flex items-center justify-center gap-2']"
      >
        <span
          v-for="(permission, index) in permissions"
          :key="permission.id"
          :class="[
            'h-1.5 rounded-full transition-all duration-200',
            index === page ? 'w-7 bg-neutral-800 dark:bg-neutral-200' : 'w-1.5',
            index < page ? 'bg-neutral-400 dark:bg-neutral-500' : '',
            index > page ? 'bg-neutral-200 dark:bg-neutral-700' : '',
          ]"
        />
      </div>
      <div v-else />
      <div :class="['flex justify-end']">
        <button
          v-if="props.onLater && !onSummary"
          type="button"
          :class="['px-1 py-2 text-sm text-neutral-500 font-medium outline-none dark:text-neutral-400']"
          @click="props.onLater()"
        >
          {{ t('settings.dialogs.onboarding.permissions.flow.setUpLater') }}
        </button>
      </div>
    </div>

    <!-- One permission -->
    <div v-if="current" :key="current.id" :class="['min-h-0 flex flex-1 flex-col items-center justify-center gap-5 text-center']">
      <PermissionMicrophoneCheck
        v-if="current.kind === 'microphone'"
        v-model:heard="microphoneHeard"
        v-model:quiet="microphoneQuiet"
        :active="granted"
      />

      <div
        v-else-if="current.kind === 'accessibility'"
        role="img"
        :aria-label="(current.shortcutKeys?.() ?? []).join(' + ')"
        :class="['flex items-center gap-3']"
      >
        <div
          v-for="key in current.shortcutKeys?.() ?? []"
          :key="key"
          :class="[
            'h-18 min-w-21 flex items-center justify-center rounded-xl px-5 text-xl font-medium',
            'bg-neutral-100 shadow-[inset_0_-3px_0_rgba(0,0,0,0.08)] dark:bg-neutral-800/60 dark:shadow-[inset_0_-3px_0_rgba(0,0,0,0.5)]',
            granted ? 'text-neutral-900 dark:text-neutral-50' : 'text-neutral-400 dark:text-neutral-500',
          ]"
        >
          {{ key }}
        </div>
      </div>

      <div
        v-else-if="current.kind === 'screen-recording'"
        role="img"
        :aria-label="t(granted ? 'settings.dialogs.onboarding.permissions.flow.screen-recording.visible' : 'settings.dialogs.onboarding.permissions.flow.screen-recording.hidden')"
        :class="['relative h-49 w-80 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800/60']"
      >
        <!-- A drawing of a desktop. The real screen is never shown here. -->
        <div :class="['absolute inset-0 transition-all duration-300', granted ? '' : 'blur-[3px] grayscale opacity-45']">
          <div :class="['h-3.5 bg-neutral-200 dark:bg-neutral-700/60']" />
          <div :class="['absolute left-4.5 top-7.5 h-28 w-42 rounded-lg bg-white dark:bg-neutral-700/50']">
            <div :class="['h-3 rounded-t-lg bg-neutral-200 dark:bg-neutral-600/60']" />
            <div :class="['mx-3 mt-2.5 flex flex-col gap-1.5']">
              <span v-for="width in ['w-27', 'w-34', 'w-24', 'w-30']" :key="width" :class="[width, 'h-1.25 rounded-full bg-neutral-200 dark:bg-neutral-600']" />
            </div>
          </div>
          <div :class="['absolute right-4.5 top-13 size-30 rounded-lg bg-white dark:bg-neutral-700/50']" />
        </div>
        <div
          v-if="!granted"
          :class="['absolute inset-0 flex items-center justify-center']"
        >
          <span :class="['flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900/85 dark:text-neutral-300']">
            <div :class="['i-mingcute:forbid-circle-line', 'size-4']" />
            {{ t('settings.dialogs.onboarding.permissions.flow.screen-recording.hidden') }}
          </span>
        </div>
        <span
          v-else
          :class="['absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs text-neutral-700 dark:bg-neutral-900/85 dark:text-neutral-300']"
        >
          <div :class="['i-mingcute:check-line', 'size-3.5 text-green-600 dark:text-green-400']" />
          {{ t('settings.dialogs.onboarding.permissions.flow.screen-recording.visible') }}
        </span>
      </div>

      <div
        v-else
        :class="['size-22 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200']"
      >
        <div :class="[icons[current.kind], 'size-10']" />
      </div>

      <h2 :class="['m-0 text-3xl text-neutral-900 font-bold leading-tight dark:text-neutral-50']">
        {{ t(`settings.dialogs.onboarding.permissions.flow.${copyKey}.title`) }}
      </h2>
      <p :class="['m-0 text-base text-neutral-500 dark:text-neutral-400']">
        {{ t(`settings.dialogs.onboarding.permissions.flow.${copyKey}.body`) }}
      </p>

      <div v-if="current.kind === 'microphone' && granted" :class="['w-full max-w-80 flex flex-col gap-2 text-left']">
        <MicrophonePicker
          v-model="selectedAudioInput"
          layout="select"
          :label="t('settings.pages.modules.hearing.sections.section.input-device.label')"
          :options="audioInputOptions"
          :placeholder="t('settings.pages.modules.hearing.sections.section.input-device.placeholder')"
          :permission="microphonePermission"
          :request-access="audioDevice.askPermission"
        />
        <p v-if="microphoneQuiet" :class="['m-0 text-center text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.permissions.flow.microphone-testing.quiet') }}
        </p>
      </div>
      <div v-if="current.kind === 'accessibility' && status" :class="['flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300']">
        <div :class="[granted ? 'i-mingcute:check-circle-fill text-green-600 dark:text-green-400' : 'i-mingcute:forbid-circle-line', 'size-4']" />
        {{ t(granted ? 'settings.dialogs.onboarding.permissions.flow.accessibility.on' : 'settings.dialogs.onboarding.permissions.flow.accessibility.off') }}
      </div>
    </div>

    <!-- Summary -->
    <div v-else :class="['min-h-0 flex flex-1 flex-col items-center justify-center gap-6']">
      <h2 :class="['m-0 text-3xl text-neutral-900 font-bold leading-tight dark:text-neutral-50']">
        {{ t('settings.dialogs.onboarding.permissions.flow.summary.title') }}
      </h2>
      <ul :class="['m-0 w-full max-w-110 flex flex-col list-none p-0']">
        <li
          v-for="permission in permissions"
          :key="permission.id"
          :class="['flex items-center gap-3.5 border-b border-neutral-100 border-solid px-1 py-3.5 last:border-b-0 dark:border-neutral-900']"
        >
          <div :class="[icons[permission.kind], 'size-5.5 text-neutral-600 dark:text-neutral-300']" />
          <span :class="['flex-1 text-sm font-medium']">{{ t(permission.titleKey) }}</span>
          <div
            v-if="statuses[permission.id] === 'granted'"
            role="img"
            :aria-label="t('settings.dialogs.onboarding.permissions.stateGranted')"
            :class="['i-mingcute:check-line', 'size-5.5 text-green-600 dark:text-green-400']"
          />
          <span v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t(skipped.has(permission.id) ? 'settings.dialogs.onboarding.permissions.flow.summary.skipped' : 'settings.dialogs.onboarding.permissions.stateNotGranted') }}
          </span>
        </li>
      </ul>
      <p :class="['m-0 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.dialogs.onboarding.permissions.flow.summary.body') }}
      </p>
    </div>

    <div :class="['mx-auto w-full max-w-90 flex flex-col gap-2']">
      <template v-if="onSummary">
        <Button variant="primary" size="lg" :label="t('settings.dialogs.onboarding.permissions.flow.done')" @click="props.onNext()" />
      </template>
      <template v-else>
        <Button
          variant="primary"
          size="lg"
          :label="primaryLabel"
          :loading="busyId === current?.id"
          :disabled="!status || (granted && !ready)"
          @click="primary"
        />
        <Button
          variant="secondary"
          size="lg"
          :class="['bg-transparent! text-neutral-500! dark:text-neutral-400!']"
          :label="t('settings.dialogs.onboarding.permissions.flow.skip')"
          @click="skip"
        />
      </template>
    </div>
  </div>
</template>
