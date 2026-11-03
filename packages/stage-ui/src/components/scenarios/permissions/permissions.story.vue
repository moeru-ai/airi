<script setup lang="ts">
import type { DevicePermission, DevicePermissionKind, DevicePermissionStatus, ShortcutTryEvent } from '../../../stores/device-permissions'

import { useIntervalFn } from '@vueuse/core'
import { computed, defineComponent, h, reactive, shallowRef, watch } from 'vue'

import StepPermissions from '../dialogs/onboarding/step-permissions.vue'
import MicrophoneVoiceVisual from './microphone-voice-visual.vue'
import PermissionBasicPage from './permission-basic-page.vue'
import PermissionMicrophonePage from './permission-microphone-page.vue'
import PermissionScreenPage from './permission-screen-page.vue'
import PermissionShortcutPage from './permission-shortcut-page.vue'
import PermissionSummary from './permission-summary.vue'

import { useDevicePermissionsStore } from '../../../stores/device-permissions'

const statusOptions = [
  { label: 'Not determined', value: 'not-determined' },
  { label: 'Granted', value: 'granted' },
  { label: 'Denied', value: 'denied' },
]

/** A drawing of a desktop as an image, so the screen preview has something to show without a real capture. */
function desktopPicture(accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#1f2937"/><rect width="960" height="28" fill="#111827"/><rect x="60" y="80" width="520" height="360" rx="14" fill="#374151"/><rect x="620" y="140" width="280" height="340" rx="14" fill="${accent}"/><rect x="380" y="548" width="200" height="36" rx="10" fill="#111827"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** A host permission whose status the controls set. A request grants it, as a user who allows the system prompt. */
function fakePermission(kind: DevicePermissionKind, status: () => DevicePermissionStatus, onRequest: () => void, extras: Partial<DevicePermission> = {}): DevicePermission {
  const titles: Record<DevicePermissionKind, string> = {
    'microphone': 'microphone',
    'accessibility': 'accessibility',
    'screen-recording': 'screenRecording',
    'notifications': 'notifications',
  }
  return {
    id: kind,
    kind,
    titleKey: `settings.dialogs.onboarding.permissions.${titles[kind]}Title`,
    descriptionKey: `settings.dialogs.onboarding.permissions.${titles[kind]}Description`,
    check: async () => status(),
    request: async () => onRequest(),
    ...extras,
  }
}

// --- Push to Talk: a fake global hook that the controls can fire, as a press in another app.

let sendGlobalPress: ((event: ShortcutTryEvent) => void) | undefined
const shortcut = reactive({ status: 'not-determined' as DevicePermissionStatus, waiting: false })
const shortcutPermission = fakePermission('accessibility', () => shortcut.status, () => shortcut.status = 'granted', {
  settingsLocationKey: 'settings.dialogs.onboarding.permissions.flow.accessibility.location',
  shortcutKeys: () => ['Ctrl', 'Shift', 'Space'],
  tryShortcut: (listener) => {
    sendGlobalPress = listener
    return () => sendGlobalPress = undefined
  },
})

function pressInAnotherApp() {
  if (shortcut.status !== 'granted')
    return
  sendGlobalPress?.({ phase: 'down' })
  setTimeout(() => sendGlobalPress?.({ phase: 'up' }), 600)
}

// --- Screen Recording: two drawings stand in for the displays.

const screen = reactive({ status: 'not-determined' as DevicePermissionStatus, waiting: false })
const screenPermission = fakePermission('screen-recording', () => screen.status, () => screen.status = 'granted', {
  settingsLocationKey: 'settings.dialogs.onboarding.permissions.flow.screen-recording.location',
  captureScreens: async () => [
    { id: 'screen-1', name: 'Built-in display', imageUrl: desktopPicture('#0e7490') },
    { id: 'screen-2', name: 'Display 2', imageUrl: desktopPicture('#7c3aed') },
  ],
})

// --- Microphone visual: a fake voice, because a story cannot rely on a microphone.

const voice = reactive({ mode: 'speaking' as 'off' | 'quiet' | 'speaking' })
const bands = shallowRef([0, 0, 0, 0])
let voiceSeconds = 0
useIntervalFn(() => {
  voiceSeconds += 0.033
  if (voice.mode !== 'speaking') {
    bands.value = [0, 0, 0, 0]
    return
  }
  // Syllables of about 250 ms in phrases of about 2 seconds, with more energy in the low bands.
  const phrase = Math.max(0, Math.sin(voiceSeconds * Math.PI / 2))
  const syllable = Math.max(0, Math.sin(voiceSeconds * Math.PI * 4))
  bands.value = [0.9, 0.75, 0.55, 0.35].map((weight, index) => Math.min(1, phrase * syllable * weight * (0.8 + 0.4 * Math.sin(voiceSeconds * (3 + index)))))
}, 33)

// --- Summary.

const summary = reactive({ microphone: 'granted', accessibility: 'not-determined', screen: 'granted', skipAccessibility: true })
const summaryPermissions = computed(() => [
  fakePermission('microphone', () => 'granted', () => {}),
  fakePermission('accessibility', () => 'not-determined', () => {}),
  fakePermission('screen-recording', () => 'granted', () => {}),
])
const summaryStatuses = computed<Record<string, DevicePermissionStatus>>(() => ({
  'microphone': summary.microphone as DevicePermissionStatus,
  'accessibility': summary.accessibility as DevicePermissionStatus,
  'screen-recording': summary.screen as DevicePermissionStatus,
}))
const summarySkipped = computed(() => new Set(summary.skipAccessibility ? ['accessibility'] : []))

// --- The whole flow, with a host that has the permissions of macOS.

const flow = reactive({
  microphone: 'not-determined' as DevicePermissionStatus,
  accessibility: 'not-determined' as DevicePermissionStatus,
  screen: 'not-determined' as DevicePermissionStatus,
})
/**
 * Histoire mounts each variant in its own app with its own Pinia, so the host registers its permissions inside the
 * variant, as a host app does at startup.
 */
const FlowHost = defineComponent({
  name: 'PermissionsFlowHost',
  setup() {
    const devicePermissions = useDevicePermissionsStore()
    // A new list makes the flow read the statuses again, as a host does after the user returns from the system settings.
    watch(flow, () => devicePermissions.register([
      fakePermission('microphone', () => flow.microphone, () => flow.microphone = 'granted'),
      { ...shortcutPermission, check: async () => flow.accessibility, request: async () => void (flow.accessibility = 'granted') },
      { ...screenPermission, check: async () => flow.screen, request: async () => void (flow.screen = 'granted') },
    ]), { immediate: true, deep: true })
    return () => h(StepPermissions, { onNext: () => {}, onLater: () => {} })
  },
})

const notifications = reactive({ granted: false })
const notificationsPermission = fakePermission('notifications', () => notifications.granted ? 'granted' : 'not-determined', () => notifications.granted = true)
</script>

<template>
  <Story title="Permissions" group="scenarios" :layout="{ type: 'single', iframe: true }">
    <Variant id="flow" title="Onboarding step (whole flow)">
      <template #controls>
        <HstSelect v-model="flow.microphone" title="Microphone" :options="statusOptions" />
        <HstSelect v-model="flow.accessibility" title="Accessibility" :options="statusOptions" />
        <HstSelect v-model="flow.screen" title="Screen Recording" :options="statusOptions" />
      </template>
      <div :class="['h-[650px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <FlowHost />
      </div>
    </Variant>

    <Variant id="push-to-talk" title="Push to Talk (Accessibility)">
      <template #controls>
        <HstSelect v-model="shortcut.status" title="Accessibility" :options="statusOptions" />
        <HstCheckbox v-model="shortcut.waiting" title="Waiting for the system settings" />
        <button type="button" :class="['mt-2 rounded-md bg-neutral-200 px-3 py-1.5 text-sm dark:bg-neutral-700']" @click="pressInAnotherApp">
          Press in another app (needs Accessibility)
        </button>
      </template>
      <div :class="['h-[560px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <PermissionShortcutPage :permission="shortcutPermission" :granted="shortcut.status === 'granted'" :waiting="shortcut.waiting" />
      </div>
    </Variant>

    <Variant id="screen-recording" title="Screen Recording">
      <template #controls>
        <HstSelect v-model="screen.status" title="Screen Recording" :options="statusOptions" />
        <HstCheckbox v-model="screen.waiting" title="Waiting for the system settings" />
      </template>
      <div :class="['h-[560px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <PermissionScreenPage :permission="screenPermission" :granted="screen.status === 'granted'" :waiting="screen.waiting" />
      </div>
    </Variant>

    <Variant id="microphone-visual" title="Microphone waves">
      <template #controls>
        <HstSelect
          v-model="voice.mode"
          title="Input"
          :options="[{ label: 'No access', value: 'off' }, { label: 'Quiet room', value: 'quiet' }, { label: 'Speaking', value: 'speaking' }]"
        />
      </template>
      <div :class="['relative h-[420px] w-[420px] overflow-hidden rounded-3xl bg-neutral-100 dark:bg-neutral-800/50']">
        <MicrophoneVoiceVisual label="Microphone input level" :bands="bands" :active="voice.mode !== 'off'" />
      </div>
    </Variant>

    <Variant id="microphone-ask" title="Microphone (before access)">
      <div :class="['h-[560px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <PermissionMicrophonePage :granted="false" />
      </div>
    </Variant>

    <Variant id="notifications" title="Notifications (Pocket)">
      <template #controls>
        <HstCheckbox v-model="notifications.granted" title="Granted" />
      </template>
      <div :class="['h-[560px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <PermissionBasicPage :permission="notificationsPermission" :granted="notifications.granted" />
      </div>
    </Variant>

    <Variant id="summary" title="Summary">
      <template #controls>
        <HstSelect v-model="summary.microphone" title="Microphone" :options="statusOptions" />
        <HstSelect v-model="summary.accessibility" title="Accessibility" :options="statusOptions" />
        <HstSelect v-model="summary.screen" title="Screen Recording" :options="statusOptions" />
        <HstCheckbox v-model="summary.skipAccessibility" title="Accessibility was skipped" />
      </template>
      <div :class="['h-[560px] w-[1000px] flex flex-col bg-white p-8 dark:bg-[#121212]']">
        <PermissionSummary :permissions="summaryPermissions" :statuses="summaryStatuses" :skipped="summarySkipped" />
      </div>
    </Variant>
  </Story>
</template>
