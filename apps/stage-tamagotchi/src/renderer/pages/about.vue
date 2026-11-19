<script setup lang="ts">
import type { BugReportDialogSubmitPayload } from '@proj-airi/stage-ui/components'

import type { ElectronUpdaterChannel, ElectronUpdaterPreferences } from '../../shared/eventa'

import semver from 'semver'

import { useElectronAutoUpdater, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { AboutContent, BugReportDialog, createBugReportPageContext, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useAnalytics, useBuildInfo } from '@proj-airi/stage-ui/composables'
import { formatBytes } from '@proj-airi/stage-ui/libs/inference/format-bytes'
import { Alert, Button, ContainerError, DoubleCheckButton, FieldCheckbox, FieldSelect, GhostButton, Progress, ScrollableArea, Tooltip } from '@proj-airi/ui'
import { useClipboard, useNow } from '@vueuse/core'
import { intervalToDuration, intlFormat, intlFormatDistance } from 'date-fns'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WindowTitleBar from '../components/Window/TitleBar.vue'

import { electronAppGetVersion, electronGetUpdaterPreferences, electronSetUpdaterPreferences } from '../../shared/eventa'
import { channelOfVersion, updateChannels } from '../../shared/update-channels'

const buildInfo = useBuildInfo()
// The main process owns the app version. Packaging can change it after the renderer build, so `buildInfo.version`
// can be out of date. The page shows an empty version until main replies.
const appVersion = ref('')
const { t, locale } = useI18n()
const { copy: copyToClipboard, isSupported: isClipboardSupported } = useClipboard()

const {
  state: updateState,
  isBusy,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
} = useElectronAutoUpdater()

const {
  trackUpdateDownloaded,
  trackUpdateInstallClicked,
  trackSettingsChanged,
} = useAnalytics()

const isDisabled = computed(() => updateState.value.status === 'disabled')
// Only an install that a store or a package manager updates reports `disabled`. Flatpak and Nix are known only at runtime, so the Steam build flag is not enough.
const isExternallyUpdated = computed(() => import.meta.env.VITE_DISTRIBUTION === 'steam' || isDisabled.value)
const isLatestVersion = computed(() => {
  return updateState.value.status === 'not-available' && !isDisabled.value
})
const isError = computed(() => updateState.value.status === 'error')
const updaterErrorMessage = computed(() => {
  const message = updateState.value.error?.message
  if (typeof message === 'string')
    return message

  if (message == null)
    return ''

  try {
    return JSON.stringify(message, null, 2)
  }
  catch {
    return String(message)
  }
})

const showChangelog = ref(false)
const showBugReportDialog = ref(false)
const updateChannelOptions = ['auto', ...updateChannels] as const
type UpdateChannelOption = typeof updateChannelOptions[number]
const updateChannelSelectOptions = computed(() => updateChannelOptions.map(channel => ({
  label: t(`tamagotchi.stage.about.update.channels.${channel}`),
  value: channel,
})))
const selectedUpdateChannel = ref<UpdateChannelOption>('auto')
const autoDownload = ref(true)
// Starts true, so no change sends defaults in place of the stored preferences before the first read returns.
const isUpdatePreferenceUpdating = ref(true)
const bugReportDescription = ref('')
const includeBugReportTriageContext = ref(false)
const uploadBugReportMediaFromLibrary = ref(false)
const bugReportScreenshotFiles = ref<File[] | undefined>(undefined)
const bugReportSending = ref(false)
const bugReportSubmitError = ref<unknown>(undefined)
const bugReportPageContext = ref(createBugReportPageContext())
const bugReportScreenshotAttached = ref(false)

const isWindowsUpdater = computed(() => {
  return updateState.value.diagnostics?.platform === 'win32'
})

/** Names the update state in a few words, so the actions fit next to it. The description below it gives the details. */
const updateStatusLabel = computed(() => {
  switch (updateState.value.status) {
    case 'checking':
      return t('tamagotchi.stage.about.update.actions.checking')
    case 'not-available':
      return t('tamagotchi.stage.about.update.status.up-to-date')
    case 'available':
    case 'manual-install-required':
      return t('tamagotchi.stage.about.update.status.available')
    case 'downloading':
      return t('tamagotchi.stage.about.update.status.downloading')
    case 'downloaded':
      return t('tamagotchi.stage.about.update.status.ready')
    default:
      return t('tamagotchi.stage.about.update.status.title')
  }
})

const restartButtonLabel = computed(() => {
  return isWindowsUpdater.value
    ? t('tamagotchi.stage.about.update.actions.restart-silent')
    : t('tamagotchi.stage.about.update.actions.restart-install')
})

const requiresWindowsAdminUpdatePrompt = computed(() => {
  return isWindowsUpdater.value && updateState.value.diagnostics?.requiresAdminForInstallPath === true
})

const updateInstallDirectory = computed(() => {
  return updateState.value.diagnostics?.installDirectory ?? updateState.value.diagnostics?.executablePath ?? ''
})

function normalizeSemver(version: string | undefined) {
  if (!version)
    return undefined

  return semver.valid(version) ?? semver.valid(version.startsWith('v') ? version.slice(1) : version)
}

const isDowngradeUpdate = computed(() => {
  const currentVersion = normalizeSemver(appVersion.value)
  const targetVersion = normalizeSemver(updateState.value.info?.version)
  if (!currentVersion || !targetVersion)
    return false

  return semver.lt(targetVersion, currentVersion)
})

/**
 * The version of the running build in three parts: the release, the build of that release, and its channel.
 *
 * `channelOfVersion` gives the channel. When the channel is `dev` or `nightly`, the build part leaves out that
 * identifier, in the prerelease or in the build metadata.
 *
 * @example
 * // '0.13.0+dev.821.13eef81' -> { release: '0.13.0', build: '821 · 13eef81', channel: 'dev' }
 * // '0.14.0-rc.1' -> { release: '0.14.0', build: 'rc.1', channel: 'canary' }
 */
const runningVersion = computed(() => {
  const parsed = semver.parse(appVersion.value)
  if (!parsed)
    return undefined

  const channel = channelOfVersion(parsed.raw)
  // The channel badge already names `dev` or `nightly`, so the build part leaves it out.
  const parts = [...parsed.prerelease, ...parsed.build].map(String).filter(part => part !== channel)
  const build = parts.length === 0
    ? buildInfo.commit
    : channel === 'canary'
      ? parts.join('.')
      : parts.join(' · ')

  return { release: `${parsed.major}.${parsed.minor}.${parsed.patch}`, build, channel }
})

const channelBadgeClass: Record<ReturnType<typeof channelOfVersion>, string[]> = {
  stable: ['bg-primary-500/15 text-primary-600', 'dark:bg-primary-400/15 dark:text-primary-300'],
  canary: ['bg-amber-500/15 text-amber-700', 'dark:bg-amber-400/15 dark:text-amber-300'],
  nightly: ['bg-violet-500/15 text-violet-700', 'dark:bg-violet-400/15 dark:text-violet-300'],
  dev: ['bg-pink-500/15 text-pink-700', 'dark:bg-pink-400/15 dark:text-pink-300'],
}

// The description names the versions of an update. A manual install names its version in its own message.
const hasVersionChange = computed(() => ['available', 'downloading', 'downloaded'].includes(updateState.value.status))

const now = useNow({ interval: 60_000 })
const builtOnDate = computed(() => {
  const date = new Date(buildInfo.builtOn)
  return Number.isNaN(date.getTime()) ? undefined : date
})
const builtOnRelativeText = computed(() => builtOnDate.value
  ? intlFormatDistance(builtOnDate.value, now.value, { locale: locale.value })
  : buildInfo.builtOn)
/** Shows the download speed, and the time left when the speed lets the page estimate it. */
const downloadProgressText = computed(() => {
  const progress = updateState.value.progress
  if (!progress)
    return ''

  const speed = `${formatBytes(progress.bytesPerSecond)}/s`
  const remainingBytes = progress.total - progress.transferred
  if (progress.bytesPerSecond <= 0 || remainingBytes <= 0)
    return speed

  // Seconds are enough. A smaller unit changes on each progress event and is hard to read.
  const remainingMs = Math.max(1, Math.round(remainingBytes / progress.bytesPerSecond)) * 1000
  const duration = new Intl.DurationFormat(locale.value, { style: 'short' })
    .format(intervalToDuration({ start: 0, end: remainingMs }))

  return t('tamagotchi.stage.about.update.status.download-remaining', { duration, speed })
})
/** The release date of the update, in the app language. An update without a valid date shows nothing. */
const releasedOnText = computed(() => {
  const date = new Date(updateState.value.info?.releaseDate ?? '')
  if (Number.isNaN(date.getTime()))
    return ''

  return t('tamagotchi.stage.about.update.dialog.released-on', {
    date: intlFormat(date, { dateStyle: 'medium' }, { locale: locale.value }),
  })
})
const builtOnFullText = computed(() => builtOnDate.value
  ? intlFormat(builtOnDate.value, { dateStyle: 'medium', timeStyle: 'short' }, { locale: locale.value })
  : buildInfo.builtOn)

const getAppVersion = useElectronEventaInvoke(electronAppGetVersion)
const getUpdaterPreferences = useElectronEventaInvoke(electronGetUpdaterPreferences)
const setUpdaterPreferences = useElectronEventaInvoke(electronSetUpdaterPreferences)

function handleQuitAndInstall() {
  trackUpdateInstallClicked({ channel: selectedUpdateChannel.value, version: updateState.value.info?.version })
  quitAndInstall()
}

// Fires on the state transition (not the download click) so the event means
// "an update binary actually landed on this machine".
watch(() => updateState.value.status, (status) => {
  if (status === 'downloaded')
    trackUpdateDownloaded({ channel: selectedUpdateChannel.value, version: updateState.value.info?.version })
})

function handleDownloadClick() {
  if (updateState.value.info?.releaseNotes)
    showChangelog.value = true
  else
    downloadUpdate()
}

function confirmDownload() {
  showChangelog.value = false
  downloadUpdate()
}

function confirmRestart() {
  showChangelog.value = false
  handleQuitAndInstall()
}

function openBugReportDialog() {
  const details = [
    `Current version: ${appVersion.value}`,
    `Update status: ${updateState.value.status}`,
    updaterErrorMessage.value ? `Error: ${updaterErrorMessage.value}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  bugReportDescription.value = details
  bugReportSubmitError.value = undefined
  showBugReportDialog.value = true
}

function onBugReportRequestTriageContext() {
  includeBugReportTriageContext.value = true
  bugReportScreenshotAttached.value = true
  bugReportPageContext.value = createBugReportPageContext()
}

async function onBugReportSubmit(payload: BugReportDialogSubmitPayload) {
  bugReportSending.value = true
  bugReportSubmitError.value = undefined

  try {
    if (!isClipboardSupported.value)
      throw new Error('Clipboard API is unavailable')

    await copyToClipboard(payload.formattedReport)
    showBugReportDialog.value = false
  }
  catch (error) {
    bugReportSubmitError.value = error
  }
  finally {
    bugReportSending.value = false
  }
}

async function refreshAppVersion() {
  appVersion.value = await getAppVersion()
}

function applyUpdaterPreferences(preferences: ElectronUpdaterPreferences | undefined) {
  selectedUpdateChannel.value = preferences?.channel ?? 'auto'
  autoDownload.value = preferences?.autoDownload ?? true
}

async function refreshUpdaterPreferences() {
  try {
    applyUpdaterPreferences(await getUpdaterPreferences())
  }
  finally {
    isUpdatePreferenceUpdating.value = false
  }
}

/** Sends every preference, because main reads a missing channel as auto. */
async function saveUpdaterPreferences(next: { channel: UpdateChannelOption, autoDownload: boolean }) {
  applyUpdaterPreferences(await setUpdaterPreferences({
    autoDownload: next.autoDownload,
    channel: next.channel === 'auto' ? undefined : next.channel as ElectronUpdaterChannel,
  }))
}

async function setUpdateChannelPreference(channel: UpdateChannelOption) {
  if (isUpdatePreferenceUpdating.value)
    return

  isUpdatePreferenceUpdating.value = true
  try {
    const previousChannel = selectedUpdateChannel.value
    await saveUpdaterPreferences({ channel, autoDownload: autoDownload.value })
    trackSettingsChanged({
      setting_name: 'update_channel',
      previous_value: previousChannel,
      new_value: selectedUpdateChannel.value,
      source: 'settings',
    })
    await checkForUpdates()
  }
  finally {
    isUpdatePreferenceUpdating.value = false
  }
}

async function setAutoDownloadPreference(enabled: boolean) {
  if (isUpdatePreferenceUpdating.value)
    return

  isUpdatePreferenceUpdating.value = true
  try {
    const previous = autoDownload.value
    await saveUpdaterPreferences({ channel: selectedUpdateChannel.value, autoDownload: enabled })
    trackSettingsChanged({
      setting_name: 'update_auto_download',
      previous_value: previous,
      new_value: autoDownload.value,
      source: 'settings',
    })
  }
  finally {
    isUpdatePreferenceUpdating.value = false
  }
}

// Ensure releaseNotes is a string for the renderer
const releaseNotesContent = computed(() => {
  const notes = updateState.value.info?.releaseNotes
  if (Array.isArray(notes)) {
    return notes.map(n => typeof n === 'string' ? n : n?.note ?? '').join('\n\n')
  }
  return typeof notes === 'string' ? notes : ''
})

/**
 * Where the version change of an update leads. A release opens its notes. A dev or nightly build has no notes, so it
 * opens the page that compares its commits.
 */
const changesTarget = computed(() => {
  if (releaseNotesContent.value)
    return { kind: 'notes' as const, label: t('tamagotchi.stage.about.update.actions.whats-new') }
  if (updateState.value.changesUrl)
    return { kind: 'link' as const, url: updateState.value.changesUrl, label: t('tamagotchi.stage.about.update.actions.view-changes') }
  return undefined
})

function openChangelog() {
  showChangelog.value = true
}

onMounted(() => {
  void refreshAppVersion()
  void refreshUpdaterPreferences()
})
</script>

<template>
  <div
    :class="[
      'min-h-100dvh',
      'min-w-100dvw',
      'pt-11',
      'bg-neutral-50/80',
      'text-neutral-800',
      'dark:bg-neutral-900',
      'dark:text-neutral-100',
    ]"
  >
    <WindowTitleBar :title="t('tamagotchi.stage.window.titles.about')" icon="i-solar:info-circle-bold" />
    <div :class="['mx-auto max-w-[min(960px,calc(100%-2rem))]', 'p-6']">
      <AboutContent
        title="Project"
        highlight="AIRI"
        :subtitle="t('tamagotchi.stage.about.subtitle')"
      >
        <template #after-subtitle>
          <div v-if="runningVersion" :class="['mt-4 flex flex-col items-center gap-1.5']">
            <div :class="['flex flex-wrap items-center justify-center gap-2']">
              <span :class="['rounded-md px-2 py-0.5', 'font-mono text-sm font-medium', 'bg-neutral-300/60 text-neutral-700', 'dark:bg-neutral-700/60 dark:text-neutral-200']">
                v{{ runningVersion.release }}
              </span>
              <span :class="['rounded-md px-2 py-0.5', 'font-mono text-sm', 'bg-neutral-300/40 text-neutral-500', 'dark:bg-neutral-700/40 dark:text-neutral-400']">
                {{ runningVersion.build }}
              </span>
              <span :class="['rounded-md px-2 py-0.5', 'text-sm font-medium', ...channelBadgeClass[runningVersion.channel]]">
                {{ t(`tamagotchi.stage.about.update.channels.${runningVersion.channel}`) }}
              </span>
            </div>
            <i18n-t
              v-if="runningVersion.channel !== 'stable'"
              keypath="tamagotchi.stage.about.build-origin"
              tag="div"
              :class="['text-xs text-neutral-500 dark:text-neutral-400']"
            >
              <template #time>
                <time
                  :datetime="builtOnDate?.toISOString()"
                  :title="builtOnFullText"
                  :class="['whitespace-nowrap']"
                >{{ builtOnRelativeText }}</time>
              </template>
              <template #branch>
                <span :class="['whitespace-nowrap font-mono']">{{ buildInfo.branch }}</span>
              </template>
              <template #commit>
                <span :class="['whitespace-nowrap font-mono']">{{ buildInfo.commit }}</span>
              </template>
            </i18n-t>
          </div>
        </template>

        <template #before-build-info>
          <!-- The update status: what the app updates to, the action for it, and the download progress -->
          <div :class="['flex flex-col gap-4 rounded-xl p-4', 'bg-neutral-200/80 dark:bg-neutral-800', 'backdrop-blur-sm']">
            <!-- The state on the left and the versions on the right. A long dev version moves under the state. -->
            <div :class="['flex flex-wrap items-center justify-between gap-x-4 gap-y-1']">
              <div :class="['flex items-center gap-1.5', 'text-sm font-medium']">
                <div v-if="isLatestVersion" :class="['i-mingcute:check-circle-line text-base text-emerald-600 dark:text-emerald-400']" />
                {{ updateStatusLabel }}
              </div>
              <!-- The version change opens what changed: the release notes, or the commits of a dev or nightly build. -->
              <Tooltip v-if="hasVersionChange && changesTarget" :label="changesTarget.label" side="top">
                <component
                  :is="changesTarget.kind === 'notes' ? 'button' : 'a'"
                  v-bind="changesTarget.kind === 'notes'
                    ? { type: 'button', onClick: openChangelog }
                    : { href: changesTarget.url, target: '_blank', rel: 'noopener noreferrer' }"
                  :class="[
                    'inline-flex flex-wrap items-center justify-end gap-x-1.5 rounded-md',
                    'font-mono text-xs text-neutral-500 dark:text-neutral-400',
                    'hover:underline hover:underline-offset-2',
                    'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
                  ]"
                >
                  <span :class="['whitespace-nowrap']">v{{ appVersion }} →</span>
                  <span :class="['whitespace-nowrap text-pink-600 dark:text-pink-400']">v{{ updateState.info?.version }}</span>
                  <span :class="[changesTarget.kind === 'notes' ? 'i-mingcute:document-line' : 'i-mingcute:external-link-line', 'size-3.5 shrink-0']" />
                </component>
              </Tooltip>
              <div v-else-if="hasVersionChange" :class="['flex flex-wrap justify-end gap-x-1.5', 'font-mono text-xs text-neutral-500 dark:text-neutral-400']">
                <span :class="['whitespace-nowrap']">v{{ appVersion }} →</span>
                <span :class="['whitespace-nowrap text-pink-600 dark:text-pink-400']">v{{ updateState.info?.version }}</span>
              </div>
              <span v-else-if="isLatestVersion" :class="['font-mono text-xs text-neutral-500 dark:text-neutral-400']">v{{ appVersion }}</span>
            </div>
            <div v-if="updateState.status === 'manual-install-required'" :class="['-mt-3 break-words text-xs text-amber-700 dark:text-amber-200']">
              {{ t('tamagotchi.stage.about.update.status.manual-install-required', { version: updateState.info?.version }) }}
            </div>
            <div v-else-if="isDisabled" :class="['-mt-3 break-words text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.stage.about.update.actions.managed-by-store') }}
            </div>

            <!-- The caption of the bar says only how the download goes. -->
            <div v-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
              <Progress :progress="updateState.progress?.percent ?? 0" />
              <div :class="['flex justify-between gap-2', 'text-xs text-neutral-500 tabular-nums dark:text-neutral-400']">
                <span>{{ (updateState.progress?.percent ?? 0).toFixed(1) }}%</span>
                <span>{{ downloadProgressText }}</span>
              </div>
            </div>

            <div v-if="!isDisabled && updateState.status !== 'downloading'" :class="['flex flex-wrap items-center justify-end gap-2']">
              <Button
                v-if="updateState.status === 'available'"
                :loading="isBusy"
                color="primary"
                variant="primary"
                icon="i-solar:download-minimalistic-outline"
                :label="t('tamagotchi.stage.about.update.actions.download-short')"
                @click="handleDownloadClick()"
              />
              <a
                v-else-if="updateState.status === 'manual-install-required'"
                href="https://github.com/moeru-ai/airi/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  icon="i-solar:download-minimalistic-outline"
                  :label="t('tamagotchi.stage.about.update.actions.open-download-page')"
                />
              </a>
              <DoubleCheckButton
                v-else-if="updateState.status === 'downloaded'"
                color="primary"
                variant="primary"
                @confirm="handleQuitAndInstall()"
              >
                {{ restartButtonLabel }}
                <template #confirm>
                  {{ t('tamagotchi.stage.about.update.actions.confirm-restart') }}
                </template>
                <template #cancel>
                  {{ t('tamagotchi.stage.about.common.cancel') }}
                </template>
              </DoubleCheckButton>
              <Button
                v-else
                v-track-button="{ name: 'update_check_clicked', channel: selectedUpdateChannel }"
                :color="isError ? 'orange' : 'neutral'"
                :variant="isError ? 'primary' : 'secondary'"
                :loading="isBusy"
                icon="i-solar:refresh-outline"
                :label="isBusy
                  ? t('tamagotchi.stage.about.update.actions.checking')
                  : isError
                    ? t('tamagotchi.stage.about.update.actions.retry-check')
                    : t('tamagotchi.stage.about.update.actions.check-for-updates')"
                @click="checkForUpdates()"
              />
            </div>

            <Alert
              v-if="requiresWindowsAdminUpdatePrompt"
              tone="warning"
              :title="t('tamagotchi.stage.about.update.notices.admin-required.title')"
            >
              <p>{{ t('tamagotchi.stage.about.update.notices.admin-required.description') }}</p>
              <p :class="['break-all']">
                {{ t('tamagotchi.stage.about.update.notices.admin-required.path', { path: updateInstallDirectory }) }}
              </p>
            </Alert>
            <Alert
              v-if="isDowngradeUpdate && updateState.status === 'available'"
              tone="warning"
              :title="t('tamagotchi.stage.about.update.notices.downgrade-available.title')"
            >
              {{ t('tamagotchi.stage.about.update.notices.downgrade-available.description') }}
            </Alert>
            <Alert
              v-else-if="isDowngradeUpdate && updateState.status === 'downloaded'"
              tone="warning"
              :title="t('tamagotchi.stage.about.update.notices.downgrade-downloaded.title')"
            >
              {{ t('tamagotchi.stage.about.update.notices.downgrade-downloaded.description') }}
            </Alert>
            <ContainerError
              v-if="isError"
              :message="updaterErrorMessage"
              height-preset="sm"
              @feedback="openBugReportDialog"
            />
          </div>

          <!-- Preferences change rarely, so they stay apart from the status above. A store or package manager install has none. -->
          <div
            v-if="!isExternallyUpdated"
            :class="['mt-4 flex flex-col gap-6 rounded-xl p-4', 'bg-neutral-200/80 dark:bg-neutral-800', 'backdrop-blur-sm']"
          >
            <h2 :class="['text-base font-semibold']">
              {{ t('tamagotchi.stage.about.update.settings.title') }}
            </h2>
            <FieldSelect
              :model-value="selectedUpdateChannel"
              :disabled="isUpdatePreferenceUpdating || isBusy"
              :label="t('tamagotchi.stage.about.update.lane.label')"
              :description="t('tamagotchi.stage.about.update.lane.description')"
              :placeholder="t('tamagotchi.stage.about.update.lane.placeholder')"
              :options="updateChannelSelectOptions"
              @update:model-value="setUpdateChannelPreference($event as UpdateChannelOption)"
            />
            <FieldCheckbox
              :model-value="autoDownload"
              :disabled="isUpdatePreferenceUpdating"
              :label="t('tamagotchi.stage.about.update.auto-download.label')"
              :description="t('tamagotchi.stage.about.update.auto-download.description')"
              @update:model-value="setAutoDownloadPreference($event)"
            />
          </div>
        </template>
      </AboutContent>
    </div>

    <!-- Release notes of the update. A download in progress shows its progress here too. -->
    <DialogRoot v-model:open="showChangelog">
      <DialogPortal>
        <DialogOverlay :class="['fixed inset-0 z-[9999] bg-black/35 data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn']" />
        <DialogContent
          :class="[
            'fixed left-1/2 top-1/2 z-[9999] max-h-[85vh] max-w-2xl w-[90vw] flex flex-col -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl shadow-xl outline-none',
            'bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100',
            'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
          ]"
        >
          <div :class="['shrink-0 flex items-start justify-between gap-4 px-6 pb-4 pt-6']">
            <div :class="['min-w-0']">
              <DialogTitle :class="['text-xl font-semibold tracking-tight']">
                {{ t('tamagotchi.stage.about.update.dialog.version-available', { version: updateState.info?.version }) }}
              </DialogTitle>
              <DialogDescription :class="['mt-1 text-sm text-neutral-500 dark:text-neutral-400']">
                {{ releasedOnText }}
              </DialogDescription>
            </div>
            <a
              v-if="updateState.changesUrl"
              :href="updateState.changesUrl"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('tamagotchi.stage.about.update.dialog.view-on-github')"
              :title="t('tamagotchi.stage.about.update.dialog.view-on-github')"
              :class="['-mr-2 shrink-0']"
            >
              <GhostButton icon="i-mingcute:external-link-line" />
            </a>
          </div>

          <!-- Only the notes scroll. The header and the actions stay visible. -->
          <div :class="['mx-6 min-h-0 flex flex-1 flex-col overflow-hidden rounded-xl', 'bg-neutral-200/60 dark:bg-neutral-800/60']">
            <ScrollableArea
              :class="['min-h-0 flex-1']"
              :style="{ maxHeight: 'calc(85vh - 12rem)' }"
              :viewport-class="['p-4']"
            >
              <MarkdownRenderer :content="releaseNotesContent || t('tamagotchi.stage.about.update.dialog.no-release-notes-markdown')" :class="['max-w-none prose prose-sm dark:prose-invert', '[&>:first-child]:mt-0']" />
            </ScrollableArea>
          </div>

          <div :class="['shrink-0 flex flex-col gap-4 px-6 pb-6 pt-4']">
            <div v-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
              <Progress :progress="updateState.progress?.percent ?? 0" />
              <div :class="['flex justify-between gap-2', 'text-xs text-neutral-500 tabular-nums dark:text-neutral-400']">
                <span>{{ (updateState.progress?.percent ?? 0).toFixed(1) }}%</span>
                <span>{{ downloadProgressText }}</span>
              </div>
            </div>
            <div :class="['flex justify-end gap-3']">
              <Button @click="showChangelog = false">
                {{ updateState.status === 'available' ? t('tamagotchi.stage.about.common.cancel') : t('tamagotchi.stage.about.common.close') }}
              </Button>
              <Button v-if="updateState.status === 'available'" color="primary" variant="primary" icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
                {{ t('tamagotchi.stage.about.update.actions.download-short') }}
              </Button>
              <Button v-else-if="updateState.status === 'downloaded'" color="primary" variant="primary" @click="confirmRestart">
                {{ t('tamagotchi.stage.about.update.actions.confirm-restart') }}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <BugReportDialog
      v-model="showBugReportDialog"
      v-model:description="bugReportDescription"
      v-model:include-triage-context="includeBugReportTriageContext"
      v-model:upload-media-from-library="uploadBugReportMediaFromLibrary"
      v-model:screenshot-files="bugReportScreenshotFiles"
      :sending="bugReportSending"
      :submit-error="bugReportSubmitError"
      :page-context="bugReportPageContext"
      :screenshot-attached="bugReportScreenshotAttached"
      @request-triage-context="onBugReportRequestTriageContext"
      @submit="onBugReportSubmit"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
