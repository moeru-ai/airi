<script setup lang="ts">
import type { Live2DMotionMagicProfileId } from '../profiles'

import { FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { live2dMotionMagicProfiles } from '../profiles'
import { useLive2DMotionMagicSettings } from '../settings'

const { t } = useI18n()
const { forceViewTarget, profileId, skipMouthOpen } = storeToRefs(useLive2DMotionMagicSettings())

const profileCopyKeys = {
  'idle-calm': {
    title: 'settings.live2d.animation.motion-driver.magic.profile.options.idle-calm.title',
    description: 'settings.live2d.animation.motion-driver.magic.profile.options.idle-calm.description',
  },
  'speaking-excited': {
    title: 'settings.live2d.animation.motion-driver.magic.profile.options.speaking-excited.title',
    description: 'settings.live2d.animation.motion-driver.magic.profile.options.speaking-excited.description',
  },
} as const satisfies Record<Live2DMotionMagicProfileId, { title: string, description: string }>

const profileOptions = computed(() => Object.values(live2dMotionMagicProfiles).map((profile) => {
  const copy = profileCopyKeys[profile.id]
  return {
    value: profile.id,
    label: t(copy.title),
    description: t(copy.description),
  }
}))
</script>

<template>
  <div :class="['grid gap-3']">
    <FieldSelect
      v-model="profileId"
      :label="t('settings.live2d.animation.motion-driver.magic.profile.title')"
      :description="t('settings.live2d.animation.motion-driver.magic.profile.description')"
      :options="profileOptions"
      layout="horizontal"
    />
    <FieldCheckbox
      v-model="skipMouthOpen"
      :label="t('settings.live2d.animation.motion-driver.magic.skip-mouth-open.title')"
      :description="t('settings.live2d.animation.motion-driver.magic.skip-mouth-open.description')"
      placement="right"
    />
    <FieldCheckbox
      v-model="forceViewTarget"
      :label="t('settings.live2d.animation.motion-driver.magic.force-view-target.title')"
      :description="t('settings.live2d.animation.motion-driver.magic.force-view-target.description')"
      placement="right"
    />
  </div>
</template>
