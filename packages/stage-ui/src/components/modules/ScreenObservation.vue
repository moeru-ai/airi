<script setup lang="ts">
import type { ScreenObserverSummary } from '@proj-airi/server-sdk-shared'

import { Button, Callout, FieldCheckbox, FieldInput, FieldValues, TransitionVertical } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useScreenObservationStore } from '../../stores/modules/screen-observation'

const { t, locale } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.screen-observation.${key}`, params ?? {})

const store = useScreenObservationStore()
const {
  enabled,
  allowedApps,
  dailySummaryEnabled,
  dailySummaryAtLocalTime,
  autoPauseOnFocus,
  onboardingCompleted,
  observationLog,
  privacyState,
  statusLabelKey,
  tasks,
} = storeToRefs(store)

const showOnboarding = computed(() => enabled.value && !onboardingCompleted.value)

// The empty-whitelist dead-state ("switch on but nothing watched") is the
// most trust-damaging silent state — it must be loudly visible, never implied.
const showEmptyWhitelistWarning = computed(() => privacyState.value === 'not_observing_empty_whitelist')

const STATUS_THEME: Record<string, 'primary' | 'violet' | 'lime' | 'orange'> = {
  observing: 'lime',
  paused: 'violet',
  not_observing_empty_whitelist: 'orange',
  suppressed_fullscreen: 'violet',
  suppressed_meeting: 'violet',
  disabled: 'primary',
}

const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }))

function logTimeRange(entry: ScreenObserverSummary) {
  return `${timeFormat.value.format(new Date(entry.windowStartedAt))} – ${timeFormat.value.format(new Date(entry.windowEndedAt))}`
}

function logPurpose(entry: ScreenObserverSummary) {
  const task = entry.taskId ? tasks.value.find(candidate => candidate.id === entry.taskId) : undefined
  return task ? tn('log.purpose-task', { task: task.title }) : tn('log.purpose-general')
}

function logApps(entry: ScreenObserverSummary) {
  return entry.apps.map(app => app.appName).join('、')
}

// TODO: wire to the desktop runtime over Eventa once the Electron main
// process ScreenObserver lands — must also purge the matching screenpipe
// data on disk, not only the renderer-side digest log.
function deleteTodayLog() {
  observationLog.value = []
}
</script>

<template>
  <div flex="~ col gap-4">
    <Callout :theme="STATUS_THEME[privacyState] ?? 'primary'" :label="tn('status-title')">
      {{ t(statusLabelKey) }}
    </Callout>

    <FieldCheckbox
      v-model="enabled"
      :label="tn('enable.label')"
      :description="tn('enable.description')"
    />

    <TransitionVertical>
      <section
        v-if="showOnboarding"
        :class="[
          'flex flex-col gap-3 rounded-xl p-4',
          'border-2 border-solid border-primary-100 bg-primary-50/60',
          'dark:border-primary-900/60 dark:bg-primary-900/10',
        ]"
      >
        <ol class="m-0 flex flex-col gap-2 pl-5 text-sm">
          <li>{{ tn('onboarding.what-it-sees') }}</li>
          <li>{{ tn('onboarding.where-data-goes') }}</li>
          <li>{{ tn('onboarding.how-to-pause') }}</li>
        </ol>
        <Button
          variant="primary" size="sm"
          icon="i-solar:check-circle-bold-duotone" :label="tn('onboarding.confirm')"
          @click="onboardingCompleted = true"
        />
      </section>
    </TransitionVertical>

    <template v-if="enabled">
      <section flex="~ col gap-3">
        <Callout v-if="showEmptyWhitelistWarning" theme="orange" :label="tn('whitelist.empty-title')">
          {{ tn('status.not-observing-empty-whitelist') }}
        </Callout>

        <FieldValues
          v-model="allowedApps"
          :label="tn('whitelist.label')"
          :description="tn('whitelist.description')"
          :value-placeholder="tn('whitelist.placeholder')"
        />
      </section>

      <section flex="~ col gap-3">
        <FieldCheckbox
          v-model="autoPauseOnFocus"
          :label="tn('auto-pause.label')"
          :description="tn('auto-pause.description')"
        />
        <p class="m-0 text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('auto-pause.never-read') }}
        </p>
      </section>

      <section flex="~ col gap-3">
        <FieldCheckbox
          v-model="dailySummaryEnabled"
          :label="tn('daily-summary.label')"
          :description="tn('daily-summary.description')"
        />
        <TransitionVertical>
          <FieldInput
            v-if="dailySummaryEnabled"
            v-model="dailySummaryAtLocalTime"
            type="time"
            :label="tn('daily-summary.time-label')"
            :description="tn('daily-summary.zero-task-note')"
          />
        </TransitionVertical>
      </section>

      <section flex="~ col gap-3">
        <div class="flex items-center justify-between gap-2">
          <div flex="~ col gap-1">
            <h3 class="m-0 text-sm font-semibold">
              {{ tn('log.title') }}
            </h3>
            <p class="m-0 text-xs text-neutral-500 dark:text-neutral-400">
              {{ tn('log.description') }}
            </p>
          </div>
          <Button
            variant="danger" size="sm"
            icon="i-solar:trash-bin-trash-bold-duotone" :label="tn('log.delete-today')"
            :disabled="!observationLog.length"
            @click="deleteTodayLog"
          />
        </div>

        <div
          v-if="!observationLog.length"
          :class="[
            'rounded-lg p-6 text-center text-xs',
            'border-2 border-dashed border-neutral-200 text-neutral-500',
            'dark:border-neutral-800',
          ]"
        >
          {{ tn('log.empty') }}
        </div>

        <ul v-else class="m-0 flex flex-col gap-2 p-0">
          <li
            v-for="entry in observationLog"
            :key="entry.id"
            :class="[
              'flex flex-col gap-1 rounded-lg px-3 py-2',
              'list-none bg-neutral-50/80 dark:bg-neutral-900/40',
            ]"
          >
            <div class="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{{ logTimeRange(entry) }}</span>
              <span>{{ logPurpose(entry) }}</span>
            </div>
            <div class="text-sm font-medium">
              {{ logApps(entry) }}
            </div>
            <div class="text-xs text-neutral-600 dark:text-neutral-300">
              {{ entry.summary }}
            </div>
          </li>
        </ul>
      </section>

      <section
        :class="[
          'flex items-center justify-between gap-3 rounded-lg px-3 py-2',
          'bg-neutral-50/80 dark:bg-neutral-900/40',
        ]"
      >
        <p class="m-0 text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('data.statement') }}
        </p>
        <!-- TODO: enable via Eventa once the desktop runtime exposes the
             screenpipe data directory; the renderer alone cannot open it. -->
        <Button
          variant="secondary" size="sm"
          icon="i-solar:folder-open-bold-duotone" :label="tn('data.open-folder')"
          disabled
        />
      </section>
    </template>
  </div>
</template>
