<script lang="ts" setup>
import { defaultControlConfig as threeCtrlConf, supportedControl as threeSupportedControl, useThreeViewControl } from '@proj-airi/stage-ui-three'
import { defaultControlConfig as l2dCtrlConf, supportedControl as l2dSupportedCtrl, useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button, GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const { stageModelRenderer } = storeToRefs(useSettingsStageModel())
const { viewControlsEnabled: l2dViewCtrlEnabled, viewControlMode: l2dCtrlMode, set: l2dSet } = useL2dViewControl()
const { viewControlsEnabled: threeSliderCtrlEnabled, viewControlMode: threeCtrlMode, set: threeSet } = useThreeViewControl()
const controlEnabled = computed(() => {
  if (stageModelRenderer.value === 'live2d')
    return { enabled: l2dViewCtrlEnabled, mode: l2dCtrlMode, supported: l2dSupportedCtrl, conf: l2dCtrlConf, reset: l2dSet }
  if (stageModelRenderer.value === 'vrm')
    return { enabled: threeSliderCtrlEnabled, mode: threeCtrlMode, supported: threeSupportedControl, conf: threeCtrlConf, reset: threeSet }
  return null
})

function handleViewControlsToggle(targetMode: string) {
  if (!controlEnabled.value || !controlEnabled.value.supported.includes(targetMode as any))
    return
  if (controlEnabled.value.mode.value === targetMode) {
    controlEnabled.value.reset(controlEnabled.value.mode.value as any)
    return
  }
  controlEnabled.value.mode.value = targetMode as any
}
</script>

<template>
  <div :class="['w-full flex items-center self-end justify-end gap-2', $slots.default ? 'flex-col' : 'flex-1']">
    <Transition name="fade">
      <div v-if="controlEnabled?.enabled.value" :class="['w-full flex justify-between gap-2', $slots.default && 'px-4 pb-4']">
        <Button
          v-for="control in controlEnabled.supported"
          :key="control"
          :aria-pressed="controlEnabled.mode.value === control"
          :color="controlEnabled.mode.value === control ? 'primary' : 'neutral'"
          variant="secondary"
          block
          @click="handleViewControlsToggle(control)"
        >
          {{ (controlEnabled.conf as any)[control].buttonText }}
        </Button>
      </div>
    </Transition>
    <GhostButton
      v-if="$slots.default"
      block size="unset"
      :disabled="!controlEnabled"
      :aria-expanded="controlEnabled?.enabled.value ?? false"
      :class="['mobile-tool-row order-first min-h-15 rounded-none px-4 py-3']"
      @click="controlEnabled && (controlEnabled.enabled.value = !controlEnabled.enabled.value)"
    >
      <span aria-hidden="true" :class="['i-solar:tuning-outline size-5 shrink-0 text-neutral-400']" />
      <span :class="['flex-1 text-left text-sm']"><slot /></span>
      <span aria-hidden="true" :class="['size-4 text-neutral-400', controlEnabled?.enabled.value ? 'i-solar:alt-arrow-up-outline' : 'i-solar:alt-arrow-down-outline']" />
    </GhostButton>
    <button
      v-else
      w-fit flex items-center self-end justify-center justify-self-end rounded-xl p-2 backdrop-blur-md
      border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" title="View"
      text="neutral-500 dark:neutral-400"
      @click="controlEnabled && (controlEnabled.enabled.value = !controlEnabled.enabled.value)"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="controlEnabled?.enabled.value" i-solar:alt-arrow-right-outline size-5 />
        <div v-else i-solar:tuning-outline size-5 />
      </Transition>
    </button>
  </div>
</template>

<style scoped>
.mobile-tool-row :deep(.basic-button-content) {
  width: 100%;
  gap: 0.75rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
