<script setup lang="ts">
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

defineProps<{
  buttonStyle: string
  iconClass: string
}>()

const { t } = useI18n()
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const { stopAllSpeaking } = useStopSpeakingButton()
</script>

<template>
  <ControlButtonTooltip side="inward">
    <ControlButton :button-style @click="stopAllSpeaking()">
      <Transition name="fade" mode="out-in">
        <div
          v-if="nowSpeaking"
          key="active"
          :class="iconClass"
          i-ph:speaker-simple-high
          text-red-500
        />
        <div
          v-else
          key="idle"
          :class="iconClass"
          i-ph:speaker-none
          text="neutral-800 dark:neutral-300"
        />
      </Transition>
    </ControlButton>
    <template #tooltip>
      {{ nowSpeaking ? t('tamagotchi.stage.controls-island.stop-speaking') : t('tamagotchi.stage.controls-island.speaker-idle') }}
    </template>
  </ControlButtonTooltip>
</template>
