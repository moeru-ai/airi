<script setup lang="ts">
import type { VoiceMessageSnapshot } from '../../../../libs/voice/voice-message'

import { Button } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { useVoiceControlsStore } from '../../../../stores/voice-controls'

const props = defineProps<{ message: VoiceMessageSnapshot }>()
const { t } = useI18n()
const controls = useVoiceControlsStore()
const url = useObjectUrl(() => props.message.audio)

function command(type: 'send' | 'discard') {
  void controls.messageCommand({ type, id: props.message.id }).catch(() => {})
}
</script>

<template>
  <div :class="['flex flex-col gap-2 rounded-xl p-2', 'bg-neutral-100 dark:bg-neutral-900']">
    <audio v-if="url" :src="url" controls :aria-label="t('stage.chat.voice-message.preview')" :class="['w-full']" />
    <p v-if="message.error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ message.error }}
    </p>
    <p v-if="message.phase === 'finalizing'" role="status">
      {{ t('stage.chat.voice-message.preparing') }}
    </p>
    <div :class="['flex justify-end gap-2']">
      <Button size="sm" :disabled="message.phase === 'sending'" @click="command('discard')">
        {{ t('stage.chat.voice-draft.discard') }}
      </Button>
      <Button size="sm" variant="primary" :disabled="message.phase !== 'ready' || !controls.snapshot.connected" @click="command('send')">
        {{ t('stage.chat.actions.send') }}
      </Button>
    </div>
  </div>
</template>
