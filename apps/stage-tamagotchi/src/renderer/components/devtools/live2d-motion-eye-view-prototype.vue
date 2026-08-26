<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DEyeViewPrototypeState } from '../../composables/live2d-motion-eye-view-prototype'

import { BasicButton, FieldRange } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  pose: Live2DMotionControlPose
  view: Live2DEyeViewPrototypeState
}>()

const emit = defineEmits<{
  updateView: [view: Live2DEyeViewPrototypeState]
}>()

const { t } = useI18n()

const targetStyle = computed(() => ({
  left: `${50 + props.view.x * 40}%`,
  top: `${50 - props.view.y * 40}%`,
}))

const counterStrength = computed({
  get: () => props.view.counterStrength,
  set: value => updateView({ counterStrength: value }),
})

const formatStrength = (value: number) => `${value.toFixed(2)}×`

function updateView(patch: Partial<Live2DEyeViewPrototypeState>) {
  emit('updateView', { ...props.view, ...patch })
}

function setTargetFromPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const bounds = target.getBoundingClientRect()
  const halfWidth = bounds.width / 2
  const halfHeight = bounds.height / 2
  updateView({
    x: Math.min(1, Math.max(-1, (event.clientX - bounds.left - halfWidth) / halfWidth)),
    y: Math.min(1, Math.max(-1, (bounds.top + halfHeight - event.clientY) / halfHeight)),
  })
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  setTargetFromPointer(event)
}

function handlePointerMove(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (!target.hasPointerCapture(event.pointerId))
    return

  setTargetFromPointer(event)
}

function handlePointerEnd(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId))
    target.releasePointerCapture(event.pointerId)
}
</script>

<template>
  <section :class="['rounded-xl bg-primary-50/55 p-4 dark:bg-primary-950/20']">
    <div :class="['flex flex-wrap items-start justify-between gap-3']">
      <div>
        <div :class="['flex items-center gap-2']">
          <span :class="['rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/50 dark:text-primary-200']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.prototype') }}
          </span>
          <h3 :class="['font-semibold text-neutral-900 dark:text-neutral-100']">
            {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.title') }}
          </h3>
        </div>
        <p :class="['mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.description') }}
        </p>
      </div>

      <div :class="['flex flex-wrap gap-2']">
        <BasicButton @click="updateView({ enabled: !props.view.enabled })">
          <span :class="[props.view.enabled ? 'i-solar:eye-bold-duotone' : 'i-solar:eye-closed-bold-duotone', 'mr-1.5 size-4']" />
          {{ props.view.enabled
            ? t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.actions.disable')
            : t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.actions.enable') }}
        </BasicButton>
        <BasicButton @click="updateView({ x: 0, y: 0 })">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.actions.center') }}
        </BasicButton>
      </div>
    </div>

    <div :class="['eye-view-layout mt-4 grid gap-4']">
      <BasicButton
        type="button"
        size="unset"
        :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.pad-label')"
        :disabled="!props.view.enabled"
        :class="[
          'relative h-52 w-full touch-none select-none overflow-hidden rounded-xl',
          'border border-neutral-300/80 dark:border-neutral-700/80',
          'bg-white/70 dark:bg-neutral-950/50',
          'shadow-inner active:scale-100!',
        ]"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerEnd"
        @pointercancel="handlePointerEnd"
        @contextmenu.prevent
      >
        <span :class="['pointer-events-none absolute inset-x-4 top-1/2 h-px', 'bg-neutral-300/80 dark:bg-neutral-700/80']" />
        <span :class="['pointer-events-none absolute inset-y-4 left-1/2 w-px', 'bg-neutral-300/80 dark:bg-neutral-700/80']" />
        <span
          :style="targetStyle"
          :class="[
            'pointer-events-none absolute size-10 rounded-full -translate-x-1/2 -translate-y-1/2',
            'border-2 border-primary-300 bg-primary-500/90 text-white dark:border-primary-500',
            'shadow-lg shadow-primary-500/20',
          ]"
        >
          <span :class="['i-solar:target-bold-duotone', 'absolute inset-2']" />
        </span>
      </BasicButton>

      <div :class="['flex flex-col gap-4']">
        <FieldRange
          v-model="counterStrength"
          :label="t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.counter.label')"
          :description="t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.counter.description')"
          :min="0"
          :max="2"
          :step="0.01"
          :default-value="1"
          :format-value="formatStrength"
          as="div"
        />

        <dl :class="['eye-view-values grid gap-2 rounded-xl bg-white/70 p-3 text-sm dark:bg-neutral-950/40']">
          <div :class="['flex items-center justify-between gap-3']">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.values.target') }} X
            </dt>
            <dd :class="['font-mono tabular-nums text-neutral-800 dark:text-neutral-100']">
              {{ props.view.x.toFixed(2) }}
            </dd>
          </div>
          <div :class="['flex items-center justify-between gap-3']">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.values.target') }} Y
            </dt>
            <dd :class="['font-mono tabular-nums text-neutral-800 dark:text-neutral-100']">
              {{ props.view.y.toFixed(2) }}
            </dd>
          </div>
          <div :class="['flex items-center justify-between gap-3']">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.values.output') }} X
            </dt>
            <dd :class="['font-mono tabular-nums text-neutral-800 dark:text-neutral-100']">
              {{ props.pose.eyeX.toFixed(2) }}
            </dd>
          </div>
          <div :class="['flex items-center justify-between gap-3']">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              {{ t('tamagotchi.settings.devtools.pages.live2d-motion.eye-view.values.output') }} Y
            </dt>
            <dd :class="['font-mono tabular-nums text-neutral-800 dark:text-neutral-100']">
              {{ props.pose.eyeY.toFixed(2) }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.eye-view-layout {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
}

.eye-view-values {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
}
</style>
