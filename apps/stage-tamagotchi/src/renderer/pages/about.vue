<script setup lang="ts">
import type { BugReportDialogSubmitPayload } from '@proj-airi/stage-ui/components'

import type { ElectronUpdaterChannel } from '../../shared/eventa'

import { useElectronAutoUpdater, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { AboutContent, BugReportDialog, createBugReportPageContext, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useBreakpoints } from '@proj-airi/stage-ui/composables'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { Button, ContainerError, DoubleCheckButton, FieldSelect, Progress } from '@proj-airi/ui'
import { useClipboard } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerDescription, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronGetUpdaterPreferences, electronSetUpdaterPreferences } from '../../shared/eventa'

const analyticsStore = useSharedAnalyticsStore()
const { buildInfo } = storeToRefs(analyticsStore)
const { t } = useI18n()
const { copy: copyToClipboard, isSupported: isClipboardSupported } = useClipboard()

const {
  state: updateState,
  isBusy,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
} = useElectronAutoUpdater()

const isDisabled = computed(() => updateState.value.status === 'disabled')
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
const updateChannelOptions = ['auto', 'stable', 'alpha', 'beta', 'nightly', 'canary'] as const
const updateChannelSelectOptions = computed(() => updateChannelOptions.map(channel => ({
  label: t(`tamagotchi.stage.about.update.channels.${channel}`),
  value: channel,
})))
type UpdateChannelOption = typeof updateChannelOptions[number]
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

const getUpdaterPreferences = useElectronEventaInvoke(electronGetUpdaterPreferences)
const setUpdaterPreferences = useElectronEventaInvoke(electronSetUpdaterPreferences)

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
    `Current version: ${buildInfo.value.version}`,
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

async function refreshUpdaterChannelPreference() {
  const preferences = await getUpdaterPreferences()
  selectedUpdateChannel.value = preferences?.channel ?? 'auto'
}

async function setUpdateChannelPreference(channel: UpdateChannelOption) {
  if (isUpdateChannelUpdating.value)
    return

  isUpdateChannelUpdating.value = true
  try {
    const nextChannel = channel === 'auto' ? undefined : channel as ElectronUpdaterChannel
    const preferences = await setUpdaterPreferences({ channel: nextChannel })
    selectedUpdateChannel.value = preferences?.channel ?? 'auto'
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
            <div
              :class="[
                'flex flex-wrap items-center justify-between gap-4',
              ]"
            >
              <div>
                <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                  {{ t('tamagotchi.stage.about.current-version') }}
                </div>
                <div :class="['text-xl font-medium font-mono']">
                  {{ buildInfo.version }}
                </div>
              </div>
              <div :class="['text-right text-xs text-neutral-400 dark:text-neutral-500']">
                <div>{{ buildInfo.branch }}@{{ buildInfo.commit }}</div>
                <div>{{ buildInfo.builtOn }}</div>
              </div>
            </div>

            <FieldSelect
              :model-value="selectedUpdateChannel"
              :disabled="isUpdateChannelUpdating || isBusy"
              :label="t('tamagotchi.stage.about.update.lane.label')"
              :description="t('tamagotchi.stage.about.update.lane.description')"
              :placeholder="t('tamagotchi.stage.about.update.lane.placeholder')"
              :options="updateChannelSelectOptions"
              @update:model-value="setUpdateChannelPreference($event as UpdateChannelOption)"
            />

            <!-- Update Logic -->
            <div :class="['flex flex-col gap-4']">
              <!-- State: Available -->
              <div v-if="updateState.status === 'available'" :class="['flex flex-col gap-4']">
                <div :class="['text-sm flex flex-wrap items-center gap-2']">
                  <span :class="['font-mono text-neutral-600 dark:text-neutral-300']">v{{ buildInfo.version }}</span>
                  <div :class="['i-solar:arrow-right-line-duotone text-lg text-neutral-400']" />
                  <span :class="['font-mono text-pink-500 dark:text-pink-400 font-bold']">v{{ updateState.info?.version }}</span>
                </div>
                <div>
                  <Button
                    variant="primary"
                    :loading="isBusy"
                    icon="i-solar:download-minimalistic-outline"
                    :label="t('tamagotchi.stage.about.update.actions.download')"
                    @click="handleDownloadClick()"
                  />
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
                <div>
                  <DoubleCheckButton
                    variant="primary"
                    @confirm="quitAndInstall()"
                  >
                    {{ restartButtonLabel }}
                    <template #confirm>
                      {{ t('tamagotchi.stage.about.update.actions.confirm-restart') }}
                    </template>
                    <template #cancel>
                      {{ t('tamagotchi.stage.about.common.cancel') }}
                    </template>
                  </DoubleCheckButton>
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
                <div v-else-if="isLatestVersion" :class="['text-sm text-emerald-600 dark:text-emerald-400']">
                  {{ t('tamagotchi.stage.about.update.status.latest', { version: buildInfo.version }) }}
                </div>

                <div :class="['flex flex-wrap gap-2']">
                  <Button
                    :variant="isError ? 'caution' : 'secondary'"
                    :loading="isBusy"
                    :disabled="isDisabled"
                    :icon="isLatestVersion ? 'i-solar:check-circle-outline' : isDisabled ? 'i-solar:forbidden-circle-outline' : 'i-solar:refresh-outline'"
                    :label="isBusy
                      ? t('tamagotchi.stage.about.update.actions.checking')
                      : isLatestVersion
                        ? t('tamagotchi.stage.about.update.actions.latest-version')
                        : isDisabled
                          ? t('tamagotchi.stage.about.update.actions.disabled-dev')
                          : isError
                            ? t('tamagotchi.stage.about.update.actions.retry-check')
                            : t('tamagotchi.stage.about.update.actions.check-for-updates')"
                    @click="checkForUpdates()"
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

          <div class="min-h-0 flex-1 overflow-y-auto border border-neutral-200 rounded-lg bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <MarkdownRenderer :content="releaseNotesContent || t('tamagotchi.stage.about.update.dialog.no-release-notes-markdown')" class="text-sm" />
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <Button variant="secondary" @click="showChangelog = false">
              {{ t('tamagotchi.stage.about.common.cancel') }}
            </Button>
            <Button variant="primary" icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
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

            <div class="min-h-0 flex-1 overflow-y-auto border border-neutral-200 rounded-lg bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
              <MarkdownRenderer :content="releaseNotesContent || t('tamagotchi.stage.about.update.dialog.no-release-notes-markdown')" class="text-sm" />
            </div>

            <div class="mt-4 flex gap-3">
              <Button variant="secondary" block @click="showChangelog = false">
                {{ t('tamagotchi.stage.about.common.cancel') }}
              </Button>
              <Button variant="primary" block icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
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
