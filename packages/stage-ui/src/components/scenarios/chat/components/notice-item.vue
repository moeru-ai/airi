<script setup lang="ts">
import type { ChatHistoryItem } from '../../../../types/chat'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import RecipeDetails from './recipe-details.vue'

import { extractMessageText } from '../../../../libs/chat-sync'

/** A stored notice, for example a finished background task. The owner did not write it, so it shows as a compact label with its text folded. */
const props = withDefaults(defineProps<{
  message: Extract<ChatHistoryItem, { role: 'user' }>
  /** How the notice paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  surface: 'translucent',
})

const { t } = useI18n()

// A background task names itself `recipe:<name>`. Other sources show as they are.
const sourceName = computed(() => props.message.notice?.source.replace(/^recipe:/, '') ?? '')
const text = computed(() => extractMessageText(props.message))
</script>

<template>
  <RecipeDetails :class="['py-1']" align="center" :label="t('stage.chat.notice.label')" :name="sourceName" :details="text" :surface="surface" />
</template>
