<script lang="ts" setup>
import {
  defaultControlConfig as threeCtrlConf,
  supportedControl as threeSupportedControl,
  useThreeViewControl,
} from '@proj-airi/stage-ui-three'
import {
  defaultControlConfig as l2dCtrlConf,
  supportedControl as l2dSupportedCtrl,
  useL2dViewControl,
} from '@proj-airi/stage-ui/stores/live2d'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

type ControlMode = (typeof threeSupportedControl)[number] | (typeof l2dSupportedCtrl)[number]

interface ControlConfig {
  buttonText: string
}

interface ControlEnabled {
  enabled: { value: boolean }
  mode: { value: ControlMode }
  supported: readonly ControlMode[]
  conf: Record<ControlMode, ControlConfig>
  reset: (mode: ControlMode) => void
}

const { stageModelRenderer } = storeToRefs(useSettingsStageModel())
const { viewControlsEnabled: l2dViewCtrlEnabled, viewControlMode: l2dCtrlMode, set: l2dSet } = useL2dViewControl()
const {
  viewControlsEnabled: threeSliderCtrlEnabled,
  viewControlMode: threeCtrlMode,
  set: threeSet,
} = useThreeViewControl()
const controlEnabled = computed<ControlEnabled | null>(() => {
  if (stageModelRenderer.value === 'live2d')
    return {
      enabled: l2dViewCtrlEnabled,
      mode: l2dCtrlMode,
      supported: l2dSupportedCtrl,
      conf: l2dCtrlConf,
      reset: l2dSet,
    }
  if (stageModelRenderer.value === 'vrm')
    return {
      enabled: threeSliderCtrlEnabled,
      mode: threeCtrlMode,
      supported: threeSupportedControl,
      conf: threeCtrlConf,
      reset: threeSet,
    }
  return null
})

function handleViewControlsToggle(targetMode: ControlMode) {
  if (!controlEnabled.value || !controlEnabled.value.supported.includes(targetMode)) return
  if (controlEnabled.value.mode.value === targetMode) {
    controlEnabled.value.reset(controlEnabled.value.mode.value)
    return
  }
  controlEnabled.value.mode.value = targetMode
}
</script>

<template>
  <div w-full flex flex-1 items-center self-end justify-end gap-2>
    <Transition name="fade">
      <div v-if="controlEnabled?.enabled.value" w-full flex justify-between gap-2>
        <Button
          v-for="control in controlEnabled.supported"
          :key="control"
          variant="secondary-muted"
          :toggled="controlEnabled.mode.value === control"
          w-full
          @click="handleViewControlsToggle(control)"
        >
          {{ controlEnabled.conf[control].buttonText }}
        </Button>
      </div>
    </Transition>
    <button
      w-fit
      flex
      items-center
      self-end
      justify-center
      justify-self-end
      rounded-xl
      p-2
      backdrop-blur-md
      border="2 solid neutral-100/60 dark:neutral-800/30"
      bg="neutral-50/70 dark:neutral-800/70"
      title="View"
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
