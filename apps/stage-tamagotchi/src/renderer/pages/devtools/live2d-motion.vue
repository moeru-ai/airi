<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { useLive2DMotionControl } from '@proj-airi/stage-ui-live2d/stores'
import { onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionJoystick from '../../components/devtools/live2d-motion-joystick.vue'

const { t } = useI18n()
const motionControl = useLive2DMotionControl()
const ownerId = crypto.randomUUID()

function setPose(pose: Live2DMotionControlPose) {
  motionControl.setPose(ownerId, pose)
}

function release() {
  motionControl.release(ownerId)
}

onUnmounted(release)
</script>

<template>
  <div :class="['flex flex-col gap-5 pb-8']">
    <div>
      <h2 :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.title') }}
      </h2>
      <p :class="['mt-1 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.description') }}
      </p>
    </div>

    <Live2DMotionJoystick
      @move="setPose"
      @release="release"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.live2d-motion.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
