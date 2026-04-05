<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { isPosthogAvailableInBuild } from '@proj-airi/stage-ui/stores/analytics'
import { useSettings, useSettingsControlsIsland } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldCombobox, FieldRange, useTheme } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  needsAutoHideControlsIslandSetting?: boolean
}>(), {
  needsAutoHideControlsIslandSetting: isStageTamagotchi(),
})

const settings = useSettings()
const settingsControlsIsland = useSettingsControlsIsland()

const showAutoHideControlsIsland = computed(() => props.needsAutoHideControlsIslandSetting)
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

    <FieldCheckbox
      v-if="showAutoHideControlsIsland"
      v-model="settingsControlsIsland.autoHideControlsIsland"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (5 * 10)"
      :delay="5 * 50"
      :label="t('settings.controls-island.auto-hide.title')"
      :description="t('settings.controls-island.auto-hide.description')"
    />

    <template v-if="showAutoHideControlsIsland && settingsControlsIsland.autoHideControlsIsland">
      <FieldRange
        v-model.number="settingsControlsIsland.autoHideDelay"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (6 * 10)"
        :delay="6 * 50"
        :min="0"
        :max="5"
        :step="0.1"
        :format-value="v => `${v}s`"
        :label="t('settings.controls-island.hide-delay.title')"
      />

      <FieldRange
        v-model.number="settingsControlsIsland.autoShowDelay"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (7 * 10)"
        :delay="7 * 50"
        :min="0"
        :max="5"
        :step="0.1"
        :format-value="v => `${v}s`"
        :label="t('settings.controls-island.show-delay.title')"
      />

      <FieldRange
        v-model.number="settingsControlsIsland.autoHideOpacity"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (8 * 10)"
        :delay="8 * 50"
        :min="0"
        :max="100"
        :step="1"
        :format-value="v => `${v}%`"
        :label="t('settings.controls-island.hidden-opacity.title')"
      />
    </template>

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
