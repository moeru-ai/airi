<script setup lang="ts">
import type { BugReportDialogSubmitPayload } from '@proj-airi/stage-ui/components'

import type { ElectronUpdaterChannel } from '../../shared/eventa'

import semver from 'semver'

import { useElectronAutoUpdater, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { AboutContent, BugReportDialog, createBugReportPageContext, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useAnalytics, useBreakpoints, useBuildInfo } from '@proj-airi/stage-ui/composables'
import { Button, ContainerError, DoubleCheckButton, FieldSelect, Progress, ScrollableArea } from '@proj-airi/ui'
import { useClipboard } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerDescription, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronAppGetVersion, electronGetUpdaterPreferences, electronSetUpdaterPreferences } from '../../shared/eventa'
import { channelOfVersion, updateChannels } from '../../shared/update-channels'

const buildInfo = useBuildInfo()
// The main process owns the app version. Packaging can change it after the renderer build, so `buildInfo.version`
// can be out of date. The page shows an empty version until main replies.
const appVersion = ref('')
const { t } = useI18n()
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
const { isDesktop } = useBreakpoints()
const updateChannelOptions = ['auto', ...updateChannels] as const
type UpdateChannelOption = typeof updateChannelOptions[number]
const updateChannelSelectOptions = computed(() => updateChannelOptions.map(channel => ({
  label: t(`tamagotchi.stage.about.update.channels.${channel}`),
  value: channel,
})))
const selectedUpdateChannel = ref<UpdateChannelOption>('auto')
const isUpdateChannelUpdating = ref(false)
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

const downloadedStatusText = computed(() => {
  if (isWindowsUpdater.value)
    return t('tamagotchi.stage.about.update.status.downloaded.windows', { version: updateState.value.info?.version ?? '' })

  return t('tamagotchi.stage.about.update.status.downloaded.restart', { version: updateState.value.info?.version ?? '' })
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

// The header button already says when the app is up to date, so the status area shows only what needs attention.
const hasUpdateStatus = computed(() => requiresWindowsAdminUpdatePrompt.value
  || isError.value
  || ['available', 'downloading', 'downloaded', 'manual-install-required'].includes(updateState.value.status))

const builtOnText = computed(() => {
  const date = new Date(buildInfo.builtOn)
  return Number.isNaN(date.getTime()) ? buildInfo.builtOn : date.toLocaleString()
})

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

async function refreshUpdaterChannelPreference() {
  const preferences = await getUpdaterPreferences()
  selectedUpdateChannel.value = preferences?.channel ?? 'auto'
}

async function setUpdateChannelPreference(channel: UpdateChannelOption) {
  if (isUpdateChannelUpdating.value)
    return

  isUpdateChannelUpdating.value = true
  try {
    const previousChannel = selectedUpdateChannel.value
    const nextChannel = channel === 'auto' ? undefined : channel as ElectronUpdaterChannel
    const preferences = await setUpdaterPreferences({ channel: nextChannel })
    selectedUpdateChannel.value = preferences?.channel ?? 'auto'
    trackSettingsChanged({
      setting_name: 'update_channel',
      previous_value: previousChannel,
      new_value: selectedUpdateChannel.value,
      source: 'settings',
    })
    await checkForUpdates()
  }
  finally {
    isUpdateChannelUpdating.value = false
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

onMounted(() => {
  void refreshAppVersion()
  void refreshUpdaterChannelPreference()
})
</script>

<template>
  <div
    :class="[
      'min-h-100dvh',
      'min-w-100dvw',
      'bg-neutral-50/80',
      'text-neutral-800',
      'dark:bg-neutral-900',
      'dark:text-neutral-100',
    ]"
  >
    <div :class="['mx-auto max-w-[min(960px,calc(100%-2rem))]', 'p-6']">
      <AboutContent
        title="Project"
        highlight="AIRI"
        :subtitle="t('tamagotchi.stage.about.subtitle')"
      >
        <template #before-build-info>
          <!-- Main Content Card -->
          <div
            :class="[
              'rounded-2xl', 'flex', 'flex-col', 'gap-6',
              'p-4',
              'rounded-xl',
              'bg-neutral-200/80 dark:bg-neutral-800',
              'backdrop-blur-sm',
            ]"
          >
            <!-- Build Info -->
            <div :class="['flex flex-wrap items-center justify-between gap-4']">
              <div :class="['flex flex-col gap-1.5']">
                <div v-if="runningVersion" :class="['flex flex-wrap items-center gap-2']">
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
                <div
                  v-if="runningVersion && runningVersion.channel !== 'stable'"
                  :class="['text-xs text-neutral-500 dark:text-neutral-400']"
                >
                  {{ t('tamagotchi.stage.about.build-origin', { time: builtOnText, branch: buildInfo.branch, commit: buildInfo.commit }) }}
                </div>
              </div>

              <div :class="['flex flex-wrap items-center gap-2']">
                <Button
                  v-if="updateState.status === 'available'"
                  :loading="isBusy"
                  icon="i-solar:download-minimalistic-outline"
                  :label="t('tamagotchi.stage.about.update.actions.download')"
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
                  color="neutral"
                  variant="secondary"
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
                  v-else-if="updateState.status !== 'downloading'"
                  v-track-button="{ name: 'update_check_clicked', channel: selectedUpdateChannel }"
                  :color="isError ? 'orange' : 'neutral'"
                  :variant="isError ? 'primary' : 'secondary'"
                  :loading="isBusy"
                  :disabled="isDisabled"
                  :icon="isLatestVersion ? 'i-solar:check-circle-outline' : isDisabled ? 'i-solar:forbidden-circle-outline' : 'i-solar:refresh-outline'"
                  :label="isBusy
                    ? t('tamagotchi.stage.about.update.actions.checking')
                    : isLatestVersion
                      ? t('tamagotchi.stage.about.update.actions.latest-version')
                      : isDisabled
                        ? t('tamagotchi.stage.about.update.actions.managed-by-store')
                        : isError
                          ? t('tamagotchi.stage.about.update.actions.retry-check')
                          : t('tamagotchi.stage.about.update.actions.check-for-updates')"
                  @click="checkForUpdates()"
                />
              </div>
            </div>

            <FieldSelect
              v-if="!isExternallyUpdated"
              :model-value="selectedUpdateChannel"
              :disabled="isUpdateChannelUpdating || isBusy"
              :label="t('tamagotchi.stage.about.update.lane.label')"
              :description="t('tamagotchi.stage.about.update.lane.description')"
              :placeholder="t('tamagotchi.stage.about.update.lane.placeholder')"
              :options="updateChannelSelectOptions"
              @update:model-value="setUpdateChannelPreference($event as UpdateChannelOption)"
            />

            <!-- Update Logic -->
            <div v-if="hasUpdateStatus" :class="['flex flex-col gap-4']">
              <div
                v-if="requiresWindowsAdminUpdatePrompt"
                :class="['text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-200']"
              >
                AIRI is installed in a protected Windows folder. Update install may require a UAC admin prompt.
                <div :class="['mt-1 text-xs break-all text-amber-700/80 dark:text-amber-100/80']">
                  Path: {{ updateInstallDirectory }}
                </div>
              </div>

              <!-- State: Available -->
              <div v-if="updateState.status === 'available'" :class="['flex flex-col gap-4']">
                <div :class="['text-sm flex flex-wrap items-center gap-2']">
                  <span :class="['font-mono text-neutral-600 dark:text-neutral-300']">v{{ appVersion }}</span>
                  <div :class="['i-solar:arrow-right-line-duotone text-lg text-neutral-400']" />
                  <span :class="['font-mono text-pink-500 dark:text-pink-400 font-bold']">v{{ updateState.info?.version }}</span>
                </div>
                <div
                  v-if="isDowngradeUpdate"
                  :class="['text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-200']"
                >
                  Selected channel offers an older build than your current version. Installing this update will downgrade AIRI.
                </div>
              </div>

              <!-- State: Manual install required -->
              <div v-else-if="updateState.status === 'manual-install-required'" :class="['flex flex-col gap-4']">
                <div :class="['text-sm text-amber-700 dark:text-amber-200']">
                  {{ t('tamagotchi.stage.about.update.status.manual-install-required', { version: updateState.info?.version }) }}
                </div>
              </div>

              <!-- State: Downloading -->
              <div v-else-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
                <div :class="['flex justify-between text-sm']">
                  <span>{{ t('tamagotchi.stage.about.update.status.downloading') }}</span>
                  <span :class="['font-mono']">{{ updateState.progress?.percent.toFixed(1) }}%</span>
                </div>
                <Progress :progress="updateState.progress?.percent ?? 0" />
                <div :class="['text-xs text-neutral-400 text-right font-mono']">
                  {{ ((updateState.progress?.bytesPerSecond ?? 0) / 1024 / 1024).toFixed(2) }} MB/s
                </div>
              </div>

              <!-- State: Downloaded -->
              <div v-else-if="updateState.status === 'downloaded'" :class="['flex flex-col gap-4']">
                <div :class="['text-sm text-emerald-600 dark:text-emerald-400']">
                  {{ downloadedStatusText }}
                </div>
                <div
                  v-if="isDowngradeUpdate"
                  :class="['text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-200']"
                >
                  Downgrade package downloaded from selected channel. Restart will install an older version.
                </div>
              </div>

              <!-- State: Idle, Checking, Error, Disabled, Not Available -->
              <div v-else :class="['flex flex-col gap-4']">
                <div v-if="isError" :class="['flex flex-col gap-2']">
                  <ContainerError
                    :message="updaterErrorMessage"
                    height-preset="sm"
                    @feedback="openBugReportDialog"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </AboutContent>
    </div>

    <!-- Changelog Dialog (Desktop) -->
    <DialogRoot v-if="isDesktop" v-model:open="showChangelog">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
        <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-[85vh] max-w-2xl w-[90vw] flex flex-col rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
          <DialogTitle class="mb-2 text-lg font-medium">
            {{ t('tamagotchi.stage.about.update.dialog.title') }}
          </DialogTitle>
          <DialogDescription class="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('tamagotchi.stage.about.update.dialog.description', { version: updateState.info?.version }) }}
          </DialogDescription>

          <ScrollableArea
            :class="['min-h-0 flex-1 border border-neutral-200 rounded-lg bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/50']"
            :style="{ maxHeight: 'calc(85vh - 12rem)' }"
            :viewport-class="['p-4']"
          >
            <MarkdownRenderer :content="releaseNotesContent || t('tamagotchi.stage.about.update.dialog.no-release-notes-markdown')" class="text-sm" />
          </ScrollableArea>

          <div class="mt-6 flex justify-end gap-3">
            <Button @click="showChangelog = false">
              {{ t('tamagotchi.stage.about.common.cancel') }}
            </Button>
            <Button icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
              {{ t('tamagotchi.stage.about.update.actions.confirm-download') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <!-- Changelog Drawer (Mobile) -->
    <DrawerRoot v-else v-model:open="showChangelog" should-scale-background>
      <DrawerPortal>
        <DrawerOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
        <DrawerContent class="fixed bottom-0 left-0 right-0 z-[10000] mt-24 h-[85vh] flex flex-col rounded-t-2xl bg-neutral-100 outline-none dark:bg-neutral-900">
          <div class="flex flex-1 flex-col rounded-t-2xl bg-white p-4 dark:bg-neutral-900">
            <DrawerHandle class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <DrawerTitle class="mb-2 text-lg font-medium">
              {{ t('tamagotchi.stage.about.update.dialog.title') }}
            </DrawerTitle>
            <DrawerDescription class="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              {{ t('tamagotchi.stage.about.update.dialog.description', { version: updateState.info?.version }) }}
            </DrawerDescription>

            <ScrollableArea
              :class="['min-h-0 flex-1 border border-neutral-200 rounded-lg bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/50']"
              :viewport-class="['p-4']"
            >
              <MarkdownRenderer :content="releaseNotesContent || t('tamagotchi.stage.about.update.dialog.no-release-notes-markdown')" class="text-sm" />
            </ScrollableArea>

            <div class="mt-4 flex gap-3">
              <Button block @click="showChangelog = false">
                {{ t('tamagotchi.stage.about.common.cancel') }}
              </Button>
              <Button block icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
                {{ t('tamagotchi.stage.about.update.actions.download-short') }}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>

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
