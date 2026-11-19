<script setup lang="ts">
import { useHostAutoUpdater } from '@proj-airi/stage-host-context'
import { Alert, Button, Progress } from '@proj-airi/ui'
import { computed } from 'vue'

const {
  state: updateState,
  isBusy,
  isSupported,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
} = useHostAutoUpdater()

const diagnosticsEntries = computed(() => {
  const diagnostics = updateState.value.diagnostics

  if (!diagnostics)
    return []

  return [
    ['status', updateState.value.status],
    ['currentVersion', updateState.value.info?.version ?? 'n/a'],
    ['platform', diagnostics.platform],
    ['arch', diagnostics.arch],
    ['channel', diagnostics.channel],
    ['feedUrl', diagnostics.feedUrl ?? 'n/a'],
    ['logFilePath', diagnostics.logFilePath],
    ['executablePath', diagnostics.executablePath],
    ['overrideActive', String(diagnostics.isOverrideActive)],
  ]
})
</script>

<template>
  <div :class="['flex flex-col gap-4', 'pb-8']">
    <Alert v-if="!isSupported" tone="warning" title="Updater unavailable">
      The Kirie host does not provide the Electron updater API.
    </Alert>

    <div :class="['flex flex-wrap gap-2']">
      <Button
        :disabled="!isSupported"
        :loading="isBusy"
        icon="i-solar:refresh-outline"
        label="Check for updates"
        @click="checkForUpdates()"
      />
      <Button

        :disabled="!isSupported || updateState.status !== 'available'"
        icon="i-solar:download-minimalistic-outline"
        label="Download update"
        @click="downloadUpdate()"
      />
      <Button

        :disabled="!isSupported || updateState.status !== 'downloaded'"
        icon="i-solar:restart-bold-duotone"
        label="Restart to install"
        @click="quitAndInstall()"
      />
    </div>

    <div v-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
      <div :class="['flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-300']">
        <span>Downloading update</span>
        <span>{{ updateState.progress?.percent.toFixed(1) }}%</span>
      </div>
      <Progress :progress="updateState.progress?.percent ?? 0" />
    </div>

    <Alert v-if="updateState.status === 'error'" tone="danger" title="Update failed">
      <pre :class="['whitespace-pre-wrap break-all']">{{ updateState.error?.message }}</pre>
    </Alert>

    <section :class="['rounded-2xl border-2 p-4', 'border-neutral-200 bg-white/70 dark:border-neutral-700/60 dark:bg-neutral-950/40']">
      <div :class="['mb-3 text-sm text-neutral-600 dark:text-neutral-400']">
        Updater diagnostics
      </div>

      <div :class="['grid gap-2 text-sm text-neutral-800 dark:text-neutral-100']">
        <div
          v-for="[label, value] in diagnosticsEntries"
          :key="label"
          :class="['grid gap-1 md:grid-cols-[180px_minmax(0,1fr)]']"
        >
          <div :class="['text-neutral-500 dark:text-neutral-400']">
            {{ label }}
          </div>
          <div :class="['font-mono break-words']">
            {{ value }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Updater
  subtitleKey: tamagotchi.settings.devtools.title
</route>
