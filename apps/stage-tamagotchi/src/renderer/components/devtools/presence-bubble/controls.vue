<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettingsPresenceBubble } from '@proj-airi/stage-ui/stores/presence-bubble'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'

const {
  presenceBubbleOverrideEnabled,
  presenceBubbleOverrideThinking,
  presenceBubbleOverrideUnread,
} = storeToRefs(useSettingsPresenceBubble())
</script>

<template>
  <Section title="Presence bubble" icon="i-solar:chat-line-line-duotone">
    <FieldCheckbox
      v-model="presenceBubbleOverrideEnabled"
      label="Drive the bubble from here"
      description="While this is off the stage shows no bubble, because nothing else feeds it yet."
    />
    <FieldCheckbox
      v-model="presenceBubbleOverrideThinking"
      label="Thinking"
      description="Shows the three dots. Takes precedence over the unread badge."
    />
    <FieldRange
      v-model="presenceBubbleOverrideUnread"
      label="Unread messages"
      description="Shown as a small circle on the head. Counts above 99 read as 99+."
      :min="0"
      :max="120"
      :step="1"
    />
    <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Changes appear in the main AIRI window.
    </div>
  </Section>
</template>
