<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { isAnalyticsAvailableInBuild } from '@proj-airi/stage-ui/libs/product-signals'
import { useSettings, useSettingsGeneral } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldCombobox, Input, useTheme } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  needsControlsIslandIconSizeSetting?: boolean
}>(), {
  needsControlsIslandIconSizeSetting: import.meta.env.RUNTIME_ENVIRONMENT === 'electron',
})

const settings = useSettings()
const settingsGeneral = useSettingsGeneral()
const showStreamerMode = import.meta.env.RUNTIME_ENVIRONMENT === 'electron'

const showControlsIsland = computed(() => props.needsControlsIslandIconSizeSetting)
const showAnalyticsSettings = computed(() => isAnalyticsAvailableInBuild())
const analyticsToggleValue = computed({
  get: () => showAnalyticsSettings.value ? settings.analyticsEnabled : false,
  set: (value: boolean) => settings.analyticsEnabled = value,
})

const { t } = useI18n()
const { themeMode } = useTheme()
const { privacyPolicyUrl } = useAnalytics()

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})
</script>

<template>
  <div :class="['flex flex-col gap-4', 'rounded-lg p-4', 'bg-neutral-50 dark:bg-neutral-800']">
    <FieldCombobox
      v-model="themeMode"
      v-motion
      :class="['mb-2']"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      :label="t('settings.theme.title')"
      :description="t('settings.theme.description')"
      :options="[
        { value: 'auto', label: t('settings.theme.auto') },
        { value: 'light', label: t('settings.theme.light') },
        { value: 'dark', label: t('settings.theme.dark') },
      ]"
    />

    <FieldCombobox
      v-model="settings.language"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      :class="['transition-all', 'ease-in-out', 'duration-250']"
      :label="t('settings.language.title')"
      :description="t('settings.language.description')"
      layout="horizontal"
      :options="languages"
    />

    <FieldCombobox
      v-if="showControlsIsland"
      v-model="settings.controlsIslandIconSize"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (4 * 10)"
      :delay="4 * 50"
      :class="['transition-all', 'ease-in-out', 'duration-250']"
      :label="t('settings.controls-island.icon-size.title')"
      :description="t('settings.controls-island.icon-size.description')"
      :options="[
        { value: 'auto', label: t('settings.controls-island.icon-size.auto') },
        { value: 'large', label: t('settings.controls-island.icon-size.large') },
        { value: 'small', label: t('settings.controls-island.icon-size.small') },
      ]"
    />

    <FieldCheckbox
      v-if="showStreamerMode"
      v-model="settings.streamerMode"
      :label="t('settings.streamer-mode.title')"
      :description="t('settings.streamer-mode.description')"
    />

    <FieldCheckbox
      v-model="analyticsToggleValue"
      v-motion
      :disabled="!showAnalyticsSettings"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (5 * 10)"
      :delay="5 * 50"
      :label="t('settings.analytics.toggle.title')"
    >
      <template #description>
        <div :class="['flex', 'flex-col', 'gap-2', 'text-xs', 'leading-relaxed']">
          <p>{{ t('settings.analytics.notice.description') }}</p>
          <p>
            {{ t('settings.analytics.notice.privacyPrefix') }}
            <a
              :href="privacyPolicyUrl"
              target="_blank"
              rel="noopener noreferrer"
              :class="['underline', 'decoration-dotted']"
            >
              {{ t('settings.analytics.notice.privacyLink') }}
            </a>.
          </p>
          <p>
            {{ showAnalyticsSettings ? t('settings.analytics.notice.settingsHint') : t('settings.analytics.disabled.title') }}
          </p>
        </div>
      </template>
    </FieldCheckbox>

    <FieldCheckbox
      v-model="settingsGeneral.translationSubtitleEnabled"
      :label="t('settings.translation-subtitle.title')"
      :description="t('settings.translation-subtitle.description')"
    />

    <FieldCombobox
      v-if="settingsGeneral.translationSubtitleEnabled"
      v-model="settingsGeneral.translationLanguage"
      :label="t('settings.translation-subtitle.language.title')"
      :description="t('settings.translation-subtitle.language.description')"
      layout="horizontal"
      :options="languages"
    />

    <fieldset :class="['flex flex-col gap-3']">
      <legend :class="['mb-3 text-sm font-medium', 'text-neutral-800 dark:text-neutral-200']">
        {{ t('settings.caption-colors.title') }}
      </legend>
      <div :class="['flex flex-col overflow-hidden rounded-lg', 'border border-neutral-200 dark:border-neutral-700']">
        <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
          <span>{{ t('settings.caption-colors.speaker') }}</span>
          <Input v-model="settingsGeneral.captionSpeakerColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
        </label>
        <details :class="['group border-t border-neutral-200 dark:border-neutral-700']">
          <summary :class="['flex cursor-pointer list-none items-center justify-between px-3 py-2', 'text-xs text-neutral-500', 'hover:bg-neutral-100 dark:hover:bg-neutral-700']">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div :class="['i-solar:alt-arrow-down-linear', 'transition-transform duration-200 group-open:rotate-180']" />
          </summary>
          <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
            <span>{{ t('settings.caption-colors.speaker') }} — {{ t('settings.caption-colors.stroke') }}</span>
            <Input v-model="settingsGeneral.captionSpeakerStrokeColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
          </label>
        </details>
      </div>
      <div :class="['flex flex-col overflow-hidden rounded-lg', 'border border-neutral-200 dark:border-neutral-700']">
        <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
          <span>{{ t('settings.caption-colors.assistant') }}</span>
          <Input v-model="settingsGeneral.captionAssistantColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
        </label>
        <details :class="['group border-t border-neutral-200 dark:border-neutral-700']">
          <summary :class="['flex cursor-pointer list-none items-center justify-between px-3 py-2', 'text-xs text-neutral-500', 'hover:bg-neutral-100 dark:hover:bg-neutral-700']">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div :class="['i-solar:alt-arrow-down-linear', 'transition-transform duration-200 group-open:rotate-180']" />
          </summary>
          <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
            <span>{{ t('settings.caption-colors.assistant') }} — {{ t('settings.caption-colors.stroke') }}</span>
            <Input v-model="settingsGeneral.captionAssistantStrokeColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
          </label>
        </details>
      </div>
      <div :class="['flex flex-col overflow-hidden rounded-lg', 'border border-neutral-200 dark:border-neutral-700']">
        <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
          <span>{{ t('settings.caption-colors.translation') }}</span>
          <Input v-model="settingsGeneral.captionTranslationColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
        </label>
        <details :class="['group border-t border-neutral-200 dark:border-neutral-700']">
          <summary :class="['flex cursor-pointer list-none items-center justify-between px-3 py-2', 'text-xs text-neutral-500', 'hover:bg-neutral-100 dark:hover:bg-neutral-700']">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div :class="['i-solar:alt-arrow-down-linear', 'transition-transform duration-200 group-open:rotate-180']" />
          </summary>
          <label :class="['flex items-center justify-between gap-4 p-3', 'text-sm text-neutral-600 dark:text-neutral-400']">
            <span>{{ t('settings.caption-colors.translation') }} — {{ t('settings.caption-colors.stroke') }}</span>
            <Input v-model="settingsGeneral.captionTranslationStrokeColor" type="color" :class="['h-9 w-14 cursor-pointer']" />
          </label>
        </details>
      </div>
    </fieldset>

    <slot name="additional-fields" />

    <div
      v-motion
      :class="['text-neutral-200/50', 'dark:text-neutral-600/20', 'pointer-events-none', 'fixed', 'top-[65dvh]', 'right--15', 'z--1', 'flex', 'items-center', 'justify-center']"
      :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="250"
    >
      <div :class="['text-60', 'i-solar:emoji-funny-square-bold-duotone']" />
    </div>
  </div>
</template>
