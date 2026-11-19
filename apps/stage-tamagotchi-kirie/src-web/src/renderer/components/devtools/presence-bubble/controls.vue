<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettingsPresenceBubble } from '@proj-airi/stage-ui/stores/presence-bubble'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  presenceBubbleOverrideEnabled,
  presenceBubbleOverrideThinking,
  presenceBubbleOverrideUnread,
} = storeToRefs(useSettingsPresenceBubble())
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.presence-bubble.title')"
    icon="i-solar:chat-line-line-duotone"
    inner-class="gap-4"
  >
    <FieldCheckbox
      v-model="presenceBubbleOverrideEnabled"
      :label="t('tamagotchi.settings.devtools.pages.presence-bubble.override.title')"
      :description="t('tamagotchi.settings.devtools.pages.presence-bubble.override.description')"
    />
    <FieldCheckbox
      v-model="presenceBubbleOverrideThinking"
      :label="t('tamagotchi.settings.devtools.pages.presence-bubble.thinking.title')"
      :description="t('tamagotchi.settings.devtools.pages.presence-bubble.thinking.description')"
    />
    <FieldRange
      v-model="presenceBubbleOverrideUnread"
      as="div"
      :min="0"
      :max="120"
      :step="1"
      :label="t('tamagotchi.settings.devtools.pages.presence-bubble.unread.title')"
      :description="t('tamagotchi.settings.devtools.pages.presence-bubble.unread.description')"
    />
    <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.presence-bubble.main-window-note') }}
    </div>
  </Section>
</template>
