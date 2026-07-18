<script setup lang="ts">
import type { SourcesOptions } from 'electron'

import { useSettingsGeneral } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldCheckbox, FieldCombobox, FieldRange, FieldTextArea, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WithScreenCapture from '../../../components/WithScreenCapture.vue'

import { useCompanionModePreviewSnapshot } from '../../../composables/use-companion-mode-preview-snapshot'
import { useVisionScreenCapture } from '../../../composables/use-vision-screen-capture'
import {
  getDefaultCompanionModePromptTemplate,
  isCompanionModeScreenSource,
  isCompanionModeSourceAllowedForKind,
  isCompanionModeWindowSource,
  resolveCompanionModeRuntimeStatus,
  useCompanionModeStore,
} from '../../../stores/companion-mode'

const AUTO_SOURCE_VALUE = '__auto__'

const companionModeStore = useCompanionModeStore()
useCompanionModePreviewSnapshot()
const settingsGeneralStore = useSettingsGeneral()
const {
  enabled,
  intervalSeconds,
  sourceKind,
  sourceId,
  promptTemplate,
  logs,
  runtimeSnapshot,
} = storeToRefs(companionModeStore)
const { language } = storeToRefs(settingsGeneralStore)

const { t } = useI18n()
const sourcesOptions = computed<SourcesOptions>(() => ({
  types: ['screen', 'window'],
  // The picker only uses names and app icons, so it must not capture screen content before opt-in.
  thumbnailSize: {
    width: 0,
    height: 0,
  },
  fetchWindowIcons: true,
}))

const {
  sources,
  isRefetching,
  refetchSources,
  cleanup,
} = useVisionScreenCapture(sourcesOptions)

const promptDraft = ref('')
const loadedPromptDraft = ref('')
const promptSaved = ref(false)
const previewImageDataUrl = ref('')
const runtimeStatusNow = ref(Date.now())
let promptSavedTimer: ReturnType<typeof setTimeout> | null = null
let runtimeStatusTimer: ReturnType<typeof setInterval> | null = null

const sourceKindOptions = computed(() => [
  {
    label: t('tamagotchi.settings.pages.companion.source.kind.screen'),
    value: 'screen',
    icon: 'i-solar:screen-share-line-duotone',
  },
  {
    label: t('tamagotchi.settings.pages.companion.source.kind.window'),
    value: 'window',
    icon: 'i-solar:window-frame-line-duotone',
  },
])

const sourceOptions = computed(() => {
  const screenOptions = sources.value
    .filter(source => isCompanionModeScreenSource(source.id))
    .map(source => ({
      label: source.name,
      value: source.id,
      icon: 'i-solar:screen-share-line-duotone',
    }))
  const windowOptions = sources.value
    .filter(source => isCompanionModeWindowSource(source.id))
    .map(source => ({
      label: source.name,
      value: source.id,
      icon: 'i-solar:window-frame-line-duotone',
    }))

  if (sourceKind.value === 'window')
    return windowOptions

  return [
    {
      label: t('tamagotchi.settings.pages.companion.source.auto-screen'),
      value: AUTO_SOURCE_VALUE,
      icon: 'i-solar:screen-share-line-duotone',
    },
    ...screenOptions,
  ]
})

const selectedSource = computed({
  get: () => sourceKind.value === 'window'
    ? sourceId.value
    : sourceId.value || AUTO_SOURCE_VALUE,
  set: (value: string) => {
    sourceId.value = value === AUTO_SOURCE_VALUE ? '' : value
  },
})

const canEnable = computed(() => sourceKind.value !== 'window' || !!sourceId.value)

const sourceTitle = computed(() => sourceKind.value === 'window'
  ? t('tamagotchi.settings.pages.companion.source.window-title')
  : t('tamagotchi.settings.pages.companion.source.screen-title'))
const sourceDescription = computed(() => sourceKind.value === 'window'
  ? t('tamagotchi.settings.pages.companion.source.window-description')
  : t('tamagotchi.settings.pages.companion.source.screen-description'))

const promptDirty = computed(() => promptDraft.value !== loadedPromptDraft.value)
const promptSaveLabel = computed(() => promptSaved.value
  ? t('tamagotchi.settings.pages.companion.prompt.saved')
  : t('tamagotchi.settings.pages.companion.prompt.save'))

const runtimeStatus = computed(() => resolveCompanionModeRuntimeStatus({
  enabled: enabled.value,
  snapshot: runtimeSnapshot.value,
  now: runtimeStatusNow.value,
}))
const statusNeedsAttention = computed(() => runtimeStatus.value.kind === 'error' || runtimeStatus.value.kind === 'unreported')

const statusIcon = computed(() => {
  if (runtimeStatus.value.kind === 'error')
    return 'i-solar:danger-triangle-bold-duotone'
  if (runtimeStatus.value.kind === 'capturing')
    return 'i-svg-spinners:ring-resize'
  if (runtimeStatus.value.kind === 'running')
    return 'i-solar:play-circle-bold-duotone'
  return 'i-solar:pause-circle-bold-duotone'
})

const statusLabel = computed(() => {
  if (runtimeStatus.value.kind === 'error')
    return t('tamagotchi.settings.pages.companion.status.error')
  if (runtimeStatus.value.kind === 'unreported')
    return t('tamagotchi.settings.pages.companion.status.unreported')
  if (runtimeStatus.value.kind === 'capturing')
    return t('tamagotchi.settings.pages.companion.status.capturing')
  if (runtimeStatus.value.kind === 'running')
    return t('tamagotchi.settings.pages.companion.status.running')
  return t('tamagotchi.settings.pages.companion.status.idle')
})

const lastActivityLabel = computed(() => {
  if (runtimeStatus.value.lastCaptureAt) {
    return t('tamagotchi.settings.pages.companion.status.last-capture', {
      time: new Date(runtimeStatus.value.lastCaptureAt).toLocaleTimeString(),
    })
  }
  if (runtimeStatus.value.lastSkippedAt) {
    return t('tamagotchi.settings.pages.companion.status.last-skip', {
      time: new Date(runtimeStatus.value.lastSkippedAt).toLocaleTimeString(),
    })
  }
  return t('tamagotchi.settings.pages.companion.status.no-capture')
})

const statusDetailLabel = computed(() => {
  if (runtimeStatus.value.kind === 'error' && runtimeStatus.value.lastError)
    return runtimeStatus.value.lastError

  return lastActivityLabel.value
})

function getCurrentPromptDraft() {
  return promptTemplate.value.trim() || getDefaultCompanionModePromptTemplate(language.value)
}

function loadPromptDraft() {
  const nextPrompt = getCurrentPromptDraft()
  promptDraft.value = nextPrompt
  loadedPromptDraft.value = nextPrompt
  promptSaved.value = false
}

function savePromptTemplate() {
  companionModeStore.setPromptTemplate(promptDraft.value)
  const nextPrompt = getCurrentPromptDraft()
  promptDraft.value = nextPrompt
  loadedPromptDraft.value = nextPrompt
  promptSaved.value = true

  if (promptSavedTimer)
    clearTimeout(promptSavedTimer)
  promptSavedTimer = setTimeout(() => {
    promptSaved.value = false
    promptSavedTimer = null
  }, 1600)
}

function resetPromptTemplate() {
  companionModeStore.setPromptTemplate('')
  loadPromptDraft()
}

function formatLogTime(createdAt: number) {
  return new Date(createdAt).toLocaleString()
}

function getLogIcon(type: string) {
  if (type === 'capture')
    return 'i-solar:camera-bold-duotone'
  if (type === 'skip')
    return 'i-solar:skip-next-bold-duotone'
  return 'i-solar:danger-triangle-bold-duotone'
}

function getLogTitle(type: string) {
  if (type === 'capture')
    return t('tamagotchi.settings.pages.companion.logs.capture')
  if (type === 'skip')
    return t('tamagotchi.settings.pages.companion.logs.skip')
  return t('tamagotchi.settings.pages.companion.logs.error')
}

function getSourceKindLabel(kind: string) {
  return kind === 'window'
    ? t('tamagotchi.settings.pages.companion.source.kind.window')
    : t('tamagotchi.settings.pages.companion.source.kind.screen')
}

function openImagePreview(imageDataUrl?: string) {
  if (!imageDataUrl)
    return

  previewImageDataUrl.value = imageDataUrl
}

function closeImagePreview() {
  previewImageDataUrl.value = ''
}

function handlePermissionGranted() {
  void refetchSources()
}

watch([promptTemplate, language], () => {
  if (!promptDirty.value)
    loadPromptDraft()
}, { immediate: true })

watch(sourceKind, () => {
  if (!isCompanionModeSourceAllowedForKind(sourceId.value, sourceKind.value))
    sourceId.value = ''
})

watch(logs, (currentLogs) => {
  if (previewImageDataUrl.value && !currentLogs.some(log => log.type === 'capture' && log.imageDataUrl === previewImageDataUrl.value))
    closeImagePreview()
})

onMounted(() => {
  runtimeStatusTimer = setInterval(() => {
    runtimeStatusNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  cleanup()
  if (promptSavedTimer)
    clearTimeout(promptSavedTimer)
  if (runtimeStatusTimer)
    clearInterval(runtimeStatusTimer)
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <div :class="['rounded-lg', 'bg-neutral-50', 'p-4', 'dark:bg-neutral-800']">
      <WithScreenCapture
        :sources-options="sourcesOptions"
        @permission-granted="handlePermissionGranted()"
      >
        <template #default="{ hasPermissions, requestPermission }">
          <div :class="['flex', 'flex-col', 'gap-4']">
            <FieldCheckbox
              v-model="enabled"
              :disabled="(!hasPermissions && !enabled) || (!enabled && !canEnable)"
              :label="t('tamagotchi.settings.pages.companion.enable.title')"
              :description="t('tamagotchi.settings.pages.companion.enable.description')"
            />

            <FieldRange
              v-model="intervalSeconds"
              as="div"
              :min="15"
              :max="600"
              :step="15"
              :default-value="60"
              :label="t('tamagotchi.settings.pages.companion.interval.title')"
              :description="t('tamagotchi.settings.pages.companion.interval.description')"
              :format-value="value => t('tamagotchi.settings.pages.companion.interval.value', { seconds: value })"
            />

            <div :class="['flex', 'flex-col', 'gap-2']">
              <div :class="['text-sm', 'font-medium']">
                {{ t('tamagotchi.settings.pages.companion.source.kind-title') }}
              </div>
              <SelectTab
                v-model="sourceKind"
                size="sm"
                :options="sourceKindOptions"
              />
            </div>

            <div v-if="hasPermissions" :class="['flex', 'items-end', 'gap-3']">
              <FieldCombobox
                v-model="selectedSource"
                :label="sourceTitle"
                :description="sourceDescription"
                :options="sourceOptions"
                :disabled="isRefetching"
                :class="['flex-1']"
                layout="vertical"
              />
              <Button
                size="sm"
                variant="secondary-muted"
                :label="isRefetching ? t('tamagotchi.settings.pages.companion.source.refetching') : t('tamagotchi.settings.pages.companion.source.refetch')"
                :icon="isRefetching ? 'i-svg-spinners:ring-resize' : 'i-solar:refresh-line-duotone'"
                :disabled="isRefetching"
                @click="refetchSources()"
              />
            </div>
            <div
              v-else
              :class="[
                'flex', 'flex-col', 'gap-3',
                'rounded-md', 'bg-amber-50', 'p-3',
                'text-sm', 'text-amber-900',
                'dark:bg-amber-950/40', 'dark:text-amber-100',
              ]"
            >
              <div>
                {{ t('tamagotchi.settings.screen-capture.permissions-prompt.description') }}
              </div>
              <div>
                <Button
                  size="sm"
                  variant="secondary-muted"
                  :label="t('tamagotchi.settings.screen-capture.permissions-prompt.open-preferences')"
                  @click="requestPermission()"
                />
              </div>
            </div>
          </div>
        </template>
      </WithScreenCapture>
    </div>

    <div :class="['rounded-lg', 'bg-neutral-50', 'p-4', 'dark:bg-neutral-800']">
      <div :class="['flex', 'flex-col', 'gap-3']">
        <FieldTextArea
          v-model="promptDraft"
          :label="t('tamagotchi.settings.pages.companion.prompt.title')"
          :description="t('tamagotchi.settings.pages.companion.prompt.description')"
          :placeholder="t('tamagotchi.settings.pages.companion.prompt.placeholder')"
          :rows="9"
          :required="false"
          :submit-on-enter="false"
          textarea-class="font-mono leading-relaxed"
        />
        <div :class="['flex', 'justify-end', 'gap-2']">
          <Button
            size="sm"
            variant="secondary-muted"
            :label="t('tamagotchi.settings.pages.companion.prompt.reset')"
            icon="i-solar:restart-line-duotone"
            @click="resetPromptTemplate()"
          />
          <Button
            size="sm"
            :label="promptSaveLabel"
            :icon="promptSaved ? 'i-solar:check-circle-bold-duotone' : 'i-solar:diskette-line-duotone'"
            :disabled="!promptDirty && !promptSaved"
            @click="savePromptTemplate()"
          />
        </div>
      </div>
    </div>

    <div
      :class="[
        'rounded-lg', 'p-4',
        'bg-neutral-50', 'dark:bg-neutral-800',
        'border', statusNeedsAttention ? 'border-amber-300/70 dark:border-amber-700/70' : 'border-transparent',
      ]"
    >
      <div :class="['flex', 'items-center', 'gap-3']">
        <div :class="[statusIcon, 'text-xl', statusNeedsAttention ? 'text-amber-500' : 'text-primary-500']" />
        <div :class="['flex', 'flex-col', 'gap-1']">
          <div :class="['text-sm', 'font-medium']">
            {{ statusLabel }}
          </div>
          <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ statusDetailLabel }}
          </div>
        </div>
      </div>
    </div>

    <div :class="['rounded-lg', 'bg-neutral-50', 'p-4', 'dark:bg-neutral-800']">
      <div :class="['mb-3', 'flex', 'items-center', 'justify-between', 'gap-3']">
        <div :class="['text-sm', 'font-medium']">
          {{ t('tamagotchi.settings.pages.companion.logs.title') }}
        </div>
        <Button
          v-if="logs.length"
          size="sm"
          variant="secondary-muted"
          :label="t('tamagotchi.settings.pages.companion.logs.clear')"
          icon="i-solar:trash-bin-minimalistic-line-duotone"
          @click="companionModeStore.clearLogs()"
        />
      </div>

      <div v-if="!logs.length" :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ t('tamagotchi.settings.pages.companion.logs.empty') }}
      </div>

      <div v-else :class="['flex', 'max-h-[520px]', 'flex-col', 'gap-3', 'overflow-y-auto', 'pr-1']">
        <div
          v-for="log in logs"
          :key="log.id"
          :class="[
            'border-t', 'border-neutral-200/70', 'pt-3', 'dark:border-neutral-700/70',
            'first:border-t-0', 'first:pt-0',
          ]"
        >
          <div :class="['flex', 'items-start', 'gap-3']">
            <div :class="[getLogIcon(log.type), 'mt-0.5', log.type === 'error' ? 'text-amber-500' : 'text-primary-500']" />
            <div :class="['min-w-0', 'flex-1']">
              <div :class="['flex', 'flex-wrap', 'items-center', 'gap-x-2', 'gap-y-1']">
                <span :class="['text-sm', 'font-medium']">{{ getLogTitle(log.type) }}</span>
                <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ formatLogTime(log.createdAt) }}</span>
              </div>

              <template v-if="log.type === 'capture'">
                <div :class="['mt-1', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ getSourceKindLabel(log.sourceKind) }} · {{ log.sourceName || t('tamagotchi.settings.pages.companion.source.auto') }}
                </div>

                <button
                  v-if="log.imageDataUrl"
                  type="button"
                  :aria-label="t('tamagotchi.settings.pages.companion.logs.open-image')"
                  :title="t('tamagotchi.settings.pages.companion.logs.open-image')"
                  :class="[
                    'mt-2', 'block', 'aspect-video', 'w-40', 'overflow-hidden', 'rounded-md',
                    'border', 'border-neutral-200', 'bg-white', 'p-0', 'outline-none',
                    'cursor-zoom-in', 'transition',
                    'hover:border-primary-400', 'focus-visible:ring-2', 'focus-visible:ring-primary-400',
                    'dark:border-neutral-700', 'dark:bg-neutral-900',
                  ]"
                  @click="openImagePreview(log.imageDataUrl)"
                >
                  <img
                    :src="log.imageDataUrl"
                    alt=""
                    :class="['h-full', 'w-full', 'object-cover']"
                  >
                </button>

                <details :class="['mt-2']">
                  <summary :class="['cursor-pointer', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                    {{ t('tamagotchi.settings.pages.companion.logs.prompt') }}
                  </summary>
                  <pre :class="['mt-2', 'whitespace-pre-wrap', 'break-words', 'rounded-md', 'bg-white/70', 'p-2', 'text-xs', 'text-neutral-700', 'dark:bg-neutral-900/70', 'dark:text-neutral-200']">{{ log.prompt }}</pre>
                </details>
              </template>

              <div v-else :class="['mt-1', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="previewImageDataUrl"
        :class="[
          'fixed', 'inset-0', 'z-[9999]', 'flex', 'items-center', 'justify-center',
          'bg-black/70', 'p-4', 'backdrop-blur-sm',
        ]"
        @click.self="closeImagePreview()"
      >
        <div :class="['relative', 'max-h-[88dvh]', 'max-w-[94dvw]']">
          <button
            type="button"
            :aria-label="t('tamagotchi.settings.pages.companion.logs.close-image')"
            :title="t('tamagotchi.settings.pages.companion.logs.close-image')"
            :class="[
              'absolute', 'right-2', 'top-2', 'z-1', 'h-9', 'w-9',
              'flex', 'items-center', 'justify-center',
              'rounded-md', 'border', 'border-white/20', 'bg-black/55',
              'text-white', 'outline-none', 'transition',
              'hover:bg-black/75', 'focus-visible:ring-2', 'focus-visible:ring-white/80',
            ]"
            @click="closeImagePreview()"
          >
            <div class="i-solar:close-circle-line-duotone text-xl" />
          </button>
          <img
            :src="previewImageDataUrl"
            :alt="t('tamagotchi.settings.pages.companion.logs.image-preview')"
            :class="[
              'block', 'max-h-[88dvh]', 'max-w-[94dvw]',
              'rounded-lg', 'bg-white', 'object-contain',
              'shadow-2xl', 'dark:bg-neutral-950',
            ]"
          >
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.companion.title
  subtitleKey: settings.title
  descriptionKey: tamagotchi.settings.pages.companion.description
  icon: i-solar:chat-round-like-bold-duotone
  settingsEntry: true
  order: 2
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
