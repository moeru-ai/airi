<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  pose: Live2DMotionControlPose
}>()

const { t } = useI18n()

const parameterGroups = computed(() => [
  {
    icon: 'i-mingcute:eye-fill',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.eyes'),
    values: [
      { axis: 'X', value: props.pose.eyeX },
      { axis: 'Y', value: props.pose.eyeY },
      { axis: t('tamagotchi.settings.devtools.pages.live2d-motion.preview.values.squint'), value: props.pose.eyeSquint },
    ],
  },
  {
    icon: 'i-mingcute:faceid-fill',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.head'),
    values: [
      { axis: 'X', value: props.pose.headX * 30 },
      { axis: 'Y', value: props.pose.headY * 30 },
      { axis: 'Z', value: props.pose.headZ * 30 },
    ],
  },
  {
    icon: 'i-mingcute:body-fill',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.body'),
    values: [
      { axis: 'X', value: props.pose.bodyX * 10 },
      { axis: 'Y', value: props.pose.bodyY * 10 },
      { axis: 'Z', value: props.pose.bodyZ * 10 },
    ],
  },
  {
    icon: 'i-mingcute:happy-fill',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.preview.groups.expression'),
    values: [
      { axis: t('tamagotchi.settings.devtools.pages.live2d-motion.preview.values.mouth-form'), value: props.pose.mouthForm },
      { axis: t('tamagotchi.settings.devtools.pages.live2d-motion.preview.values.mouth-open'), value: props.pose.mouthOpen },
    ],
  },
  {
    icon: 'i-mingcute:move-fill',
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.preview.groups.offset'),
    values: [
      { axis: 'X', value: props.pose.offsetX },
      { axis: 'Y', value: props.pose.offsetY },
    ],
  },
])
</script>

<template>
  <section :class="['motion-values-grid grid min-h-full content-center gap-3']">
    <article
      v-for="group in parameterGroups"
      :key="group.label"
      :class="['min-w-0 rounded-xl bg-neutral-100/70 p-4 dark:bg-neutral-900/55']"
    >
      <div :class="['mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100']">
        <span :class="[group.icon, 'size-4 text-primary-500']" />
        {{ group.label }}
      </div>
      <dl :class="['space-y-2 text-xs']">
        <div v-for="item in group.values" :key="item.axis" :class="['flex items-center justify-between gap-3']">
          <dt :class="['text-neutral-500 dark:text-neutral-400']">
            {{ item.axis }}
          </dt>
          <dd :class="['font-mono tabular-nums text-neutral-800 dark:text-neutral-100']">
            {{ item.value.toFixed(2) }}
          </dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.motion-values-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}
</style>
