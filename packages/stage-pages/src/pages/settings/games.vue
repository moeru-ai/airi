<script setup lang="ts">
import { CompanionPlayRoom } from '@proj-airi/stage-ui/components/scenarios/companion-games'
import { createGameMotionPort } from '@proj-airi/stage-ui/features/motions/vrm/game-port'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button } from '@proj-airi/ui'
import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const models = useSettingsStageModel()
const motionEnabled = ref(false)
const motionPort = createGameMotionPort(() => models.stageModelSelected)
const activePort = computed(() => motionEnabled.value ? motionPort : undefined)

onScopeDispose(() => motionPort.dispose())
</script>

<template>
  <div :class="['mx-auto max-w-4xl', 'flex flex-col gap-3 px-4 pt-4']">
    <div :class="['flex flex-wrap items-center gap-3']">
      <Button size="lg" :aria-pressed="motionEnabled" @click="motionEnabled = !motionEnabled">
        {{ t('companionGames.controls.avatar') }} {{ motionEnabled ? '✓' : '' }}
      </Button>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('companionGames.controls.avatar_hint') }}
      </p>
    </div>
  </div>
  <CompanionPlayRoom :model-id="models.stageModelSelected" :motion-port="activePort" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: companionGames.title
  subtitleKey: settings.title
  descriptionKey: companionGames.subtitle
  icon: i-solar:gamepad-bold-duotone
  settingsEntry: true
  order: 4.5
</route>
