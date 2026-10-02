<script setup lang="ts">
import { useCharacterMoodStore } from '@proj-airi/stage-ui/stores/character/mood'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettingsSessionLifecycle } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldInput } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { positiveNumberModel } from '../../../libs/number-model'

const { t } = useI18n()
const { dormantAfterMinutes } = storeToRefs(useSettingsSessionLifecycle())
const dormantAfterMinutesModel = positiveNumberModel(dormantAfterMinutes)

const mood = useCharacterMoodStore()
const cards = useAiriCardStore()
// Mood fades between appraisals, so the view reads it again every half minute.
const now = useNow({ interval: 30_000 })
const persona = computed(() => cards.activeCardId || 'default')
// A mood is usually a blend, so the view lists each present feeling with its share.
const feelings = computed(() => {
  // Reading the stored state keeps this view current when an appraisal lands.
  void mood.states[persona.value]
  return mood.feelingsOf(persona.value, now.value.getTime()).map(entry => ({
    key: entry.feeling,
    text: t('settings.pages.modules.memory-short-term.mood.feeling', {
      label: t(`settings.pages.modules.memory-short-term.mood.feelings.${entry.feeling}`),
      percent: Math.round(entry.intensity * 100),
    }),
    width: `${Math.round(entry.intensity * 100)}%`,
  }))
})
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.modules.memory-short-term.mood.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.memory-short-term.mood.description') }}
        </p>
      </div>
      <div v-if="mood.active" :class="['flex flex-col', 'gap-3']">
        <ul v-if="feelings.length" :class="['flex flex-col', 'gap-2']">
          <li v-for="entry in feelings" :key="entry.key" :class="['flex flex-col', 'gap-1']">
            <span :class="['text-sm']">{{ entry.text }}</span>
            <div :class="['h-1.5', 'w-full', 'rounded-full', 'bg-neutral-200 dark:bg-neutral-700']">
              <div :class="['h-full', 'rounded-full', 'bg-primary-500 dark:bg-primary-400']" :style="{ width: entry.width }" />
            </div>
          </li>
        </ul>
        <span v-else :class="['text-base font-medium']">{{ t('settings.pages.modules.memory-short-term.mood.calm') }}</span>
        <div>
          <Button size="sm" :label="t('settings.pages.modules.memory-short-term.mood.reset')" @click="mood.reset(persona)" />
        </div>
      </div>
      <p v-else :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.memory-short-term.mood.inactive') }}
      </p>
    </section>

    <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
      <div :class="['flex flex-col', 'gap-1']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.modules.memory-short-term.sessions.title') }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.memory-short-term.sessions.description') }}
        </p>
      </div>
      <FieldInput
        v-model="dormantAfterMinutesModel"
        type="number"
        :label="t('settings.pages.modules.memory-short-term.sessions.dormant_after.label')"
        :description="t('settings.pages.modules.memory-short-term.sessions.dormant_after.description')"
      />
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
