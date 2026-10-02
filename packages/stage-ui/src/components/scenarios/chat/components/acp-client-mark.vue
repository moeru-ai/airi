<script setup lang="ts">
import type { AcpClientLink } from '../../../../types/chat-session'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: AcpClientLink['status']
}>()

const { t } = useI18n()

const label = computed(() => props.status === 'connected'
  ? t('stage.chat.sessions.acp-online')
  : t('stage.chat.sessions.acp-offline'))

const iconClass = computed(() => props.status === 'connected'
  ? 'i-solar:link-outline'
  : 'i-solar:unlink-outline')
</script>

<template>
  <span
    role="img"
    :aria-label="label"
    :title="label"
    :class="[iconClass, 'size-4 shrink-0']"
  />
</template>
