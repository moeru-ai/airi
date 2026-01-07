<script setup lang="ts">
import { MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics/index'
import { Button, DoubleCheckButton, Progress } from '@proj-airi/ui'
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerDescription, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'
import { computed, ref } from 'vue'

import { useElectronAutoUpdater } from '../composables/electron-vueuse'

const analyticsStore = useSharedAnalyticsStore()
const { buildInfo } = storeToRefs(analyticsStore)

const {
  state: updateState,
  isBusy,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
} = useElectronAutoUpdater()

const isDisabled = computed(() => updateState.value.status === 'disabled')
const isLatestVersion = computed(() => updateState.value.status === 'idle' && !updateState.value.info && !isDisabled.value)
const isError = computed(() => updateState.value.status === 'error')

const links = [
  { label: 'Home', href: 'https://airi.moeru.ai/docs/', icon: 'i-solar:home-smile-outline' },
  { label: 'Documentations', href: 'https://airi.moeru.ai/docs/en/docs/overview/', icon: 'i-solar:document-add-outline' },
  { label: 'GitHub', href: 'https://github.com/moeru-ai/airi', icon: 'i-simple-icons:github' },
]

const showChangelog = ref(false)
const isDesktop = useMediaQuery('(min-width: 768px)')

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

// Ensure releaseNotes is a string for the renderer
const releaseNotesContent = computed(() => {
  const notes = updateState.value.info?.releaseNotes
  if (Array.isArray(notes)) {
    return notes.map(n => typeof n === 'string' ? n : n?.note ?? '').join('\n\n')
  }
  return typeof notes === 'string' ? notes : ''
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
    <div :class="['mx-auto max-w-[min(960px,calc(100%-2rem))]', 'px-6 py-20']">
      <!-- Header -->
      <div :class="['mb-14', 'text-center', 'font-sans-rounded']">
        <div :class="['text-5xl']">
          <span :class="['text-neutral-400 dark:text-neutral-100/65']">Project</span>
          <span :class="['text-pink-400 dark:text-pink-300/90']"> AIRI</span>
        </div>
        <div :class="['mt-2 text-base text-neutral-500 dark:text-neutral-400']">
          Desktop ver.
        </div>
      </div>

      <!-- Main Content Card -->
      <div :class="['mb-12', 'rounded-2xl', 'bg-white/50 dark:bg-black/20', 'p-6', 'backdrop-blur-sm']">
        <!-- Build Info -->
        <div :class="['flex flex-wrap items-center justify-between gap-4', 'mb-6', 'border-b border-neutral-200/50 dark:border-neutral-800/50', 'pb-6']">
          <div>
            <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              Current Version
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
                label="Download Update"
                @click="handleDownloadClick()"
              />
            </div>
          </div>

          <!-- State: Downloading -->
          <div v-else-if="updateState.status === 'downloading'" :class="['flex flex-col gap-2']">
            <div :class="['flex justify-between text-sm']">
              <span>Downloading update...</span>
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
              Update ready to install (v{{ updateState.info?.version }}).
            </div>
            <div>
              <DoubleCheckButton
                variant="primary"
                @confirm="quitAndInstall()"
              >
                Restart to update
                <template #confirm>
                  Confirm Restart
                </template>
                <template #cancel>
                  Cancel
                </template>
              </DoubleCheckButton>
            </div>
          </div>

          <!-- State: Idle, Checking, Error, Disabled, Not Available -->
          <div v-else :class="['flex flex-col gap-4']">
            <div v-if="isError" :class="['text-sm text-red-600 dark:text-red-400']">
              Error: {{ updateState.error?.message }}
            </div>

            <div :class="['flex flex-wrap gap-2']">
              <Button
                :variant="isError ? 'caution' : 'secondary'"
                :loading="isBusy"
                :disabled="isDisabled || (isLatestVersion && !isError)"
                :icon="isLatestVersion ? 'i-solar:check-circle-outline' : isDisabled ? 'i-solar:forbidden-circle-outline' : 'i-solar:refresh-outline'"
                :label="isBusy ? 'Checking...' : isLatestVersion ? 'Latest version' : isDisabled ? 'Updates disabled in Dev' : isError ? 'Retry Check' : 'Check for updates'"
                @click="checkForUpdates()"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Links -->
      <div>
        <div :class="['text-neutral-500 dark:text-neutral-400 mb-4']">
          Links
        </div>
        <div :class="['flex flex-wrap gap-2']">
          <a
            v-for="link in links"
            :key="link.href"
            :href="link.href"
            target="_blank"
            class="contents"
          >
            <Button
              variant="secondary-muted"
              :icon="link.icon"
              :label="link.label"
              size="sm"
            />
          </a>
        </div>
      </div>
    </div>

    <!-- Changelog Dialog (Desktop) -->
    <DialogRoot v-if="isDesktop" v-model:open="showChangelog">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
        <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-[85vh] max-w-2xl w-[90vw] flex flex-col rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
          <DialogTitle class="mb-2 text-lg font-medium">
            Update Available
          </DialogTitle>
          <DialogDescription class="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            A new version (v{{ updateState.info?.version }}) is available.
          </DialogDescription>

          <div class="min-h-0 flex-1 overflow-y-auto border border-neutral-200 rounded-lg bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <MarkdownRenderer :content="releaseNotesContent || '_No release notes provided._'" class="text-sm" />
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <Button variant="secondary" @click="showChangelog = false">
              Cancel
            </Button>
            <Button variant="primary" icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
              Confirm Download
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
              Update Available
            </DrawerTitle>
            <DrawerDescription class="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              A new version (v{{ updateState.info?.version }}) is available.
            </DrawerDescription>

            <div class="min-h-0 flex-1 overflow-y-auto border border-neutral-200 rounded-lg bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
              <MarkdownRenderer :content="releaseNotesContent || '_No release notes provided._'" class="text-sm" />
            </div>

            <div class="mt-4 flex gap-3">
              <Button variant="secondary" block @click="showChangelog = false">
                Cancel
              </Button>
              <Button variant="primary" block icon="i-solar:download-minimalistic-outline" @click="confirmDownload">
                Download
              </Button>
            </div>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
