<script setup lang="ts">
import type { SourcesOptions } from 'electron'

import type { ScreenAwarenessChannelEvent, ScreenAwarenessSnapshot } from '../../../stores/screen-awareness-channel'

import { Button, Callout, FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WithScreenCapture from '../../../components/WithScreenCapture.vue'

import { useVisionScreenCapture } from '../../../composables/use-vision-screen-capture'
import { SCREEN_AWARENESS_INTERVAL_OPTIONS, useScreenAwarenessStore } from '../../../stores/screen-awareness'
import { screenAwarenessChannelName } from '../../../stores/screen-awareness-channel'

const { locale, t } = useI18n()
const settingsStore = useScreenAwarenessStore()
const { enabled, intervalMs, sourceId } = storeToRefs(settingsStore)
const sourcesOptions: SourcesOptions = {
  types: ['screen'],
  fetchWindowIcons: false,
  thumbnailSize: { width: 0, height: 0 },
}

const {
  sources,
  activeSourceId,
  isRefetching,
  refetchSources,
  cleanup: cleanupCapture,
} = useVisionScreenCapture(sourcesOptions)

const snapshot = ref<ScreenAwarenessSnapshot>({
  phase: 'idle',
  lastResponse: '',
  lastObservedAt: null,
  error: null,
})
const sourceLoadFailed = ref(false)
const showRecentResponse = ref(false)
const responseContainer = ref<HTMLElement>()

const { data: channelEvent, post: postChannelEvent, close: closeChannel } = useBroadcastChannel<ScreenAwarenessChannelEvent, ScreenAwarenessChannelEvent>({
  name: screenAwarenessChannelName,
})

const sourceOptions = computed(() => sources.value.map(source => ({
  label: source.name,
  value: source.id,
})))

const intervalOptions = computed(() => SCREEN_AWARENESS_INTERVAL_OPTIONS.map(value => ({
  label: value < 60_000
    ? t('tamagotchi.settings.pages.screen-awareness.interval.seconds', { count: value / 1_000 })
    : t('tamagotchi.settings.pages.screen-awareness.interval.minutes', { count: value / 60_000 }),
  value,
})))

const phaseLabel = computed(() => t(`tamagotchi.settings.pages.screen-awareness.status.${snapshot.value.phase}`))
const observationRunning = computed(() => snapshot.value.phase === 'observing' || snapshot.value.phase === 'responding')
const canObserveNow = computed(() => !observationRunning.value && sourceOptions.value.length > 0 && !!sourceId.value)
const lastObservedLabel = computed(() => {
  if (!snapshot.value.lastObservedAt)
    return t('tamagotchi.settings.pages.screen-awareness.status.never')

  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(snapshot.value.lastObservedAt)
})

/**
 * 刷新当前可用的显示器来源并保留仍然有效的用户选择
 *
 * 返回值为 void
 */
async function refreshSources() {
  sourceLoadFailed.value = false
  activeSourceId.value = sourceId.value

  try {
    await refetchSources()
  }
  catch {
    sourceLoadFailed.value = true
  }
}

/**
 * 通过跨窗口频道请求主舞台立即执行一次屏幕观察
 *
 * 返回值为 void
 */
function observeNow() {
  postChannelEvent({ type: 'observe-now' })
}

watch(activeSourceId, (value) => {
  if (value && value !== sourceId.value)
    sourceId.value = value
})

watch(sourceId, (value) => {
  if (value && value !== activeSourceId.value && sources.value.some(source => source.id === value))
    activeSourceId.value = value
})

watch(channelEvent, (event) => {
  if (event?.type === 'state')
    snapshot.value = event.snapshot
})

watch(() => snapshot.value.lastObservedAt, async () => {
  if (!snapshot.value.lastResponse)
    return

  showRecentResponse.value = true
  await nextTick()
  responseContainer.value?.scrollTo({ top: 0 })
})

onMounted(() => {
  postChannelEvent({ type: 'request-state' })
})

onBeforeUnmount(() => {
  cleanupCapture()
  closeChannel()
})
</script>

<template>
  <WithScreenCapture
    :sources-options="sourcesOptions"
    @permission-granted="refreshSources"
  >
    <template #default="{ hasPermissions, requestPermission }">
      <div
        v-if="hasPermissions"
        :class="['h-full', 'overflow-y-auto', 'overscroll-contain', 'scrollbar-none', 'pb-6']"
      >
        <div :class="['mx-auto', 'flex', 'max-w-3xl', 'flex-col', 'gap-4']">
          <section
            :class="[
              'flex', 'flex-col', 'gap-4',
              'rounded-2xl', 'border-2', 'border-solid', 'border-neutral-100',
              'bg-white', 'p-4', 'md:p-5',
              'dark:border-neutral-900', 'dark:bg-neutral-900/30',
            ]"
          >
            <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
              <FieldCheckbox
                v-model="enabled"
                :label="t('tamagotchi.settings.pages.screen-awareness.enable.label')"
                :description="t('tamagotchi.settings.pages.screen-awareness.enable.description')"
              />
              <span
                :class="[
                  'shrink-0', 'rounded-full', 'px-2.5', 'py-1', 'text-xs', 'font-medium',
                  enabled
                    ? ['bg-lime-500/15', 'text-lime-700', 'dark:text-lime-300']
                    : ['bg-neutral-500/10', 'text-neutral-500', 'dark:text-neutral-400'],
                ]"
              >
                {{ enabled
                  ? t('tamagotchi.settings.pages.screen-awareness.enable.enabled')
                  : t('tamagotchi.settings.pages.screen-awareness.enable.disabled') }}
              </span>
            </div>

            <Callout
              theme="orange"
              :label="t('tamagotchi.settings.pages.screen-awareness.privacy.title')"
            >
              {{ t('tamagotchi.settings.pages.screen-awareness.privacy.description') }}
            </Callout>
          </section>

          <section
            :class="[
              'flex', 'flex-col', 'gap-4',
              'rounded-2xl', 'border-2', 'border-solid', 'border-neutral-100',
              'bg-white', 'p-4', 'md:p-5',
              'dark:border-neutral-900', 'dark:bg-neutral-900/30',
            ]"
          >
            <div :class="['flex', 'flex-col', 'gap-1']">
              <h2 :class="['text-sm', 'font-semibold']">
                {{ t('tamagotchi.settings.pages.screen-awareness.capture.title') }}
              </h2>
              <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ t('tamagotchi.settings.pages.screen-awareness.capture.description') }}
              </p>
            </div>

            <div :class="['flex', 'flex-col', 'gap-3', 'sm:flex-row', 'sm:items-end']">
              <FieldSelect
                v-model="sourceId"
                layout="vertical"
                :class="['min-w-0', 'flex-1']"
                :label="t('tamagotchi.settings.pages.screen-awareness.capture.display-label')"
                :placeholder="t('tamagotchi.settings.pages.screen-awareness.capture.display-placeholder')"
                :options="sourceOptions"
                :disabled="isRefetching || sourceOptions.length === 0"
              />
              <Button
                variant="secondary"
                icon="i-solar:refresh-bold-duotone"
                :label="t('tamagotchi.settings.pages.screen-awareness.capture.refresh')"
                :loading="isRefetching"
                @click="refreshSources"
              />
            </div>

            <p
              v-if="!isRefetching && sourceOptions.length === 0"
              :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
            >
              {{ t('tamagotchi.settings.pages.screen-awareness.capture.no-displays') }}
            </p>
            <Callout
              v-if="sourceLoadFailed"
              theme="orange"
              :label="t('tamagotchi.settings.pages.screen-awareness.capture.load-error')"
            />

            <FieldSelect
              v-model="intervalMs"
              layout="vertical"
              :label="t('tamagotchi.settings.pages.screen-awareness.interval.label')"
              :description="t('tamagotchi.settings.pages.screen-awareness.interval.description')"
              :options="intervalOptions"
            />
          </section>

          <section
            :class="[
              'flex', 'flex-col', 'gap-4',
              'rounded-2xl', 'border-2', 'border-solid', 'border-neutral-100',
              'bg-white', 'p-4', 'md:p-5',
              'dark:border-neutral-900', 'dark:bg-neutral-900/30',
            ]"
          >
            <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
              <div :class="['flex', 'flex-col', 'gap-1']">
                <h2 :class="['text-sm', 'font-semibold']">
                  {{ t('tamagotchi.settings.pages.screen-awareness.status.title') }}
                </h2>
                <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ t('tamagotchi.settings.pages.screen-awareness.status.current', { status: phaseLabel }) }}
                </p>
                <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ t('tamagotchi.settings.pages.screen-awareness.status.last-observed', { time: lastObservedLabel }) }}
                </p>
              </div>
              <Button
                icon="i-solar:eye-bold-duotone"
                :label="t('tamagotchi.settings.pages.screen-awareness.observe-now.label')"
                :loading="observationRunning"
                :disabled="!canObserveNow"
                @click="observeNow"
              />
            </div>

            <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ t('tamagotchi.settings.pages.screen-awareness.observe-now.description') }}
            </p>

            <Callout
              v-if="snapshot.error"
              theme="orange"
              :label="t('tamagotchi.settings.pages.screen-awareness.status.error-label')"
            />
          </section>

          <section
            :class="[
              'flex', 'min-h-0', 'flex-col', 'gap-3',
              'rounded-2xl', 'border-2', 'border-solid', 'border-neutral-100',
              'bg-white', 'p-4', 'md:p-5',
              'dark:border-neutral-900', 'dark:bg-neutral-900/30',
            ]"
          >
            <div :class="['flex', 'items-center', 'justify-between', 'gap-3']">
              <h2 :class="['text-sm', 'font-semibold']">
                {{ t('tamagotchi.settings.pages.screen-awareness.recent-response.title') }}
              </h2>
              <Button
                v-if="snapshot.lastResponse"
                variant="ghost"
                size="sm"
                :icon="showRecentResponse ? 'i-solar:alt-arrow-up-line-duotone' : 'i-solar:alt-arrow-down-line-duotone'"
                :label="showRecentResponse
                  ? t('tamagotchi.settings.pages.screen-awareness.recent-response.collapse')
                  : t('tamagotchi.settings.pages.screen-awareness.recent-response.expand')"
                @click="showRecentResponse = !showRecentResponse"
              />
            </div>

            <p
              v-if="!snapshot.lastResponse"
              :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']"
            >
              {{ t('tamagotchi.settings.pages.screen-awareness.recent-response.empty') }}
            </p>
            <div
              v-else-if="showRecentResponse"
              ref="responseContainer"
              :class="[
                'max-h-64', 'overflow-y-auto', 'overscroll-contain',
                'whitespace-pre-wrap', 'break-words',
                'rounded-xl', 'bg-neutral-100/70', 'p-3', 'text-sm', 'leading-relaxed',
                'dark:bg-neutral-950/50',
              ]"
            >
              {{ snapshot.lastResponse }}
            </div>
          </section>
        </div>
      </div>

      <div
        v-else
        :class="['h-full', 'flex', 'items-center', 'justify-center', 'p-4']"
      >
        <Callout
          theme="orange"
          :label="t('tamagotchi.settings.screen-capture.permissions-prompt.title')"
        >
          <div :class="['flex', 'flex-col', 'items-start', 'gap-3']">
            <p>{{ t('tamagotchi.settings.pages.screen-awareness.permission.description') }}</p>
            <Button
              icon="i-solar:settings-bold-duotone"
              :label="t('tamagotchi.settings.screen-capture.permissions-prompt.open-preferences')"
              @click="requestPermission"
            />
          </div>
        </Callout>
      </div>
    </template>
  </WithScreenCapture>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.screen-awareness.title
  subtitleKey: settings.title
  descriptionKey: tamagotchi.settings.pages.screen-awareness.description
  icon: i-solar:eye-scan-bold-duotone
  settingsEntry: true
  order: 5.5
  fillSettingsViewport: true
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
