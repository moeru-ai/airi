<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { isPosthogAvailableInBuild } from '@proj-airi/stage-ui/stores/analytics'
import { useSettings, useSettingsGeneral } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldCombobox, useTheme } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  needsControlsIslandIconSizeSetting?: boolean
}>(), {
  needsControlsIslandIconSizeSetting: import.meta.env.RUNTIME_ENVIRONMENT === 'electron',
})

const settings = useSettings()
const settingsGeneral = useSettingsGeneral()

const showControlsIsland = computed(() => props.needsControlsIslandIconSizeSetting)
const showAnalyticsSettings = computed(() => isPosthogAvailableInBuild())
const analyticsToggleValue = computed({
  get: () => showAnalyticsSettings.value ? settings.analyticsEnabled : false,
  set: (value: boolean) => settings.analyticsEnabled = value,
})

const { t } = useI18n()
const { isDark: dark } = useTheme()
const { privacyPolicyUrl } = useAnalytics()

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})
</script>

<template>
  <div class="flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800">
    <FieldCheckbox
      v-model="dark"
      v-motion
      :class="['mb-2']"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      :label="t('settings.theme.title')"
      :description="t('settings.theme.description')"
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
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (6 * 10)"
      :delay="6 * 50"
      :class="['mb-2']"
      :label="t('settings.translation-subtitle.title')"
      :description="t('settings.translation-subtitle.description')"
    />

    <FieldCombobox
      v-if="settingsGeneral.translationSubtitleEnabled"
      v-model="settingsGeneral.translationLanguage"
      v-motion
      :initial="{ opacity: 0, y: -10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="200"
      :class="['mb-2', 'ml-8', 'transition-all', 'ease-in-out']"
      :label="t('settings.translation-subtitle.language.title')"
      :description="t('settings.translation-subtitle.language.description')"
      layout="horizontal"
      :options="languages"
    />

    <div v-motion :initial="{ opacity: 0, y: 10 }" :enter="{ opacity: 1, y: 0 }" :delay="7 * 50" class="mb-2 flex flex-col gap-3">
      <div class="text-[0.9rem] text-neutral-800 font-medium dark:text-neutral-200">
        {{ t('settings.caption-colors.title') }}
      </div>

      <div class="flex flex-col overflow-hidden border border-neutral-200 rounded-lg bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between p-3">
          <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.speaker') }}</span>
          <input v-model="settingsGeneral.captionSpeakerColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
        </div>
        <details class="group border-t border-neutral-100 dark:border-neutral-800">
          <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div class="i-solar:alt-arrow-down-linear transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div class="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
            <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.stroke') }}</span>
            <input v-model="settingsGeneral.captionSpeakerStrokeColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
          </div>
        </details>
      </div>

      <div class="flex flex-col overflow-hidden border border-neutral-200 rounded-lg bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between p-3">
          <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.assistant') }}</span>
          <input v-model="settingsGeneral.captionAssistantColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
        </div>
        <details class="group border-t border-neutral-100 dark:border-neutral-800">
          <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div class="i-solar:alt-arrow-down-linear transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div class="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
            <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.stroke') }}</span>
            <input v-model="settingsGeneral.captionAssistantStrokeColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
          </div>
        </details>
      </div>

      <div class="flex flex-col overflow-hidden border border-neutral-200 rounded-lg bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex items-center justify-between p-3">
          <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.translation') }}</span>
          <input v-model="settingsGeneral.captionTranslationColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
        </div>
        <details class="group border-t border-neutral-100 dark:border-neutral-800">
          <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
            <span>{{ t('settings.caption-colors.stroke') }}</span>
            <div class="i-solar:alt-arrow-down-linear transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div class="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
            <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ t('settings.caption-colors.stroke') }}</span>
            <input v-model="settingsGeneral.captionTranslationStrokeColor" type="color" class="h-8 w-12 cursor-pointer border-0 rounded bg-transparent p-0">
          </div>
        </details>
      </div>
    </div>

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
