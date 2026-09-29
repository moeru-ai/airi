<script setup lang="ts">
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const { autoSendEnabled, autoSendDelay } = storeToRefs(useHearingStore())
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <section :class="['flex flex-col gap-4 rounded-xl bg-neutral-50 p-5 dark:bg-neutral-900/50']">
      <FieldCheckbox
        v-model="autoSendEnabled"
        :label="t('settings.pages.modules.hearing.auto-send.label')"
        :description="t('settings.pages.modules.hearing.auto-send.description')"
      />
      <FieldRange
        v-if="autoSendEnabled"
        v-model="autoSendDelay"
        :label="t('settings.pages.modules.hearing.auto-send.delay-label')"
        :description="t('settings.pages.modules.hearing.auto-send.delay-description')"
        :min="0"
        :max="10000"
        :step="100"
        :format-value="value => value === 0 ? t('settings.pages.modules.hearing.auto-send.immediate') : `${(value / 1000).toFixed(1)}s`"
      />
    </section>

    <nav :class="['grid gap-3 sm:grid-cols-2']">
      <RouterLink
        v-for="page in [
          { path: '/settings/modules/hearing/understanding', title: t('settings.pages.modules.hearing.understanding.title'), description: t('settings.pages.modules.hearing.understanding.description'), icon: 'i-solar:microphone-3-bold-duotone' },
          { path: '/settings/modules/hearing/wake-words', title: t('settings.pages.modules.hearing.wake-words.title'), description: t('settings.pages.modules.hearing.wake-words.description'), icon: 'i-solar:bell-bold-duotone' },
        ]"
        :key="page.path"
        :to="page.path"
        :class="[
          'flex items-center gap-4 rounded-xl border border-solid border-neutral-200 bg-white p-5',
          'transition-colors hover:border-primary-400/50 hover:bg-primary-50/40',
          'dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-primary-900/10',
        ]"
      >
        <span :class="[page.icon, 'text-2xl text-primary-500']" aria-hidden="true" />
        <span :class="['min-w-0 flex-1']">
          <span :class="['block font-medium']">{{ page.title }}</span>
          <span :class="['block text-sm text-neutral-500 dark:text-neutral-400']">{{ page.description }}</span>
        </span>
        <span :class="['i-solar:alt-arrow-right-linear shrink-0 text-neutral-400']" aria-hidden="true" />
      </RouterLink>
    </nav>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
