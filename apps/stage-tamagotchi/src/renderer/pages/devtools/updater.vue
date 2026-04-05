<script setup lang="ts">
import { useElectronAutoUpdater } from '@proj-airi/electron-vueuse'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Button, Progress } from '@proj-airi/ui'
import { computed } from 'vue'

const settings = useSettings()

const {
  state: updateState,
  isBusy,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
} = useElectronAutoUpdater()

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
    <div
      v-if="!settings.inspectUpdaterDiagnostics"
      :class="['rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100']"
    >
      Enable "Inspect updater diagnostics" from Settings > System > Developer to inspect updater internals here.
    </div>

    <template v-else>
      <div :class="['flex flex-wrap gap-2']">
        <Button
          variant="secondary"
          :loading="isBusy"
          icon="i-solar:refresh-outline"
          label="Check for updates"
          @click="checkForUpdates()"
        />
        <Button
          variant="secondary"
          :disabled="updateState.status !== 'available'"
          icon="i-solar:download-minimalistic-outline"
          label="Download update"
          @click="downloadUpdate()"
        />
        <Button
          variant="secondary"
          :disabled="updateState.status !== 'downloaded'"
          icon="i-solar:restart-bold-duotone"
          label="Restart to install"
          @click="quitAndInstall()"
        />
      </div>

      <div v-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
        <div :class="['flex items-center justify-between text-sm text-neutral-300']">
          <span>Downloading update</span>
          <span>{{ updateState.progress?.percent.toFixed(1) }}%</span>
        </div>
        <Progress :progress="updateState.progress?.percent ?? 0" />
      </div>

      <div
        v-if="updateState.status === 'error'"
        :class="['rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 whitespace-pre-wrap']"
      >
        {{ updateState.error?.message }}
      </div>

      <section :class="['rounded-2xl border border-neutral-700/60', 'bg-neutral-950/40 p-4']">
        <div :class="['mb-3 text-sm text-neutral-400']">
          Updater diagnostics
        </div>

        <div :class="['grid gap-2 text-sm text-neutral-100']">
          <div
            v-for="[label, value] in diagnosticsEntries"
            :key="label"
            :class="['grid gap-1 md:grid-cols-[180px_minmax(0,1fr)]']"
          >
            <div :class="['text-neutral-400']">
              {{ label }}
            </div>
            <div :class="['font-mono break-words']">
              {{ value }}
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Updater
  subtitleKey: tamagotchi.settings.devtools.title
</route>
