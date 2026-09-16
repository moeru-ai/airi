<script lang="ts" setup>
import { defaultControlConfig as threeCtrlConf, supportedControl as threeSupportedControl, useThreeViewControl } from '@proj-airi/stage-ui-three'
import { defaultControlConfig as l2dCtrlConf, supportedControl as l2dSupportedCtrl, useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'desktop' | 'mobile-stage'
}>(), {
  variant: 'desktop',
})

const { stageModelRenderer } = storeToRefs(useSettingsStageModel())
const { viewControlsEnabled: l2dViewCtrlEnabled, viewControlMode: l2dCtrlMode, set: l2dSet } = useL2dViewControl()
const { viewControlsEnabled: threeSliderCtrlEnabled, viewControlMode: threeCtrlMode, set: threeSet } = useThreeViewControl()
const controlEnabled = computed(() => {
  if (stageModelRenderer.value === 'live2d')
    return { enabled: l2dViewCtrlEnabled, mode: l2dCtrlMode }
  if (stageModelRenderer.value === 'vrm')
    return { enabled: threeSliderCtrlEnabled, mode: threeCtrlMode }
  return null
})

const visibleControls = computed(() => {
  if (!controlEnabled.value)
    return []

  if (stageModelRenderer.value === 'live2d')
    return l2dSupportedCtrl

  return threeSupportedControl
})

function isL2dControl(targetMode: string): targetMode is typeof l2dSupportedCtrl[number] {
  return l2dSupportedCtrl.includes(targetMode as typeof l2dSupportedCtrl[number])
}

function isThreeControl(targetMode: string): targetMode is typeof threeSupportedControl[number] {
  return threeSupportedControl.includes(targetMode as typeof threeSupportedControl[number])
}

function controlLabel(control: string) {
  if (stageModelRenderer.value === 'live2d' && isL2dControl(control))
    return l2dCtrlConf[control].buttonText

  if (stageModelRenderer.value === 'vrm' && isThreeControl(control))
    return threeCtrlConf[control].buttonText

  return control
}

function handleViewControlsToggle(targetMode: string) {
  if (stageModelRenderer.value === 'live2d' && isL2dControl(targetMode)) {
    if (l2dCtrlMode.value === targetMode)
      l2dSet(targetMode)
    else
      l2dCtrlMode.value = targetMode
    return
  }

  if (stageModelRenderer.value === 'vrm' && isThreeControl(targetMode)) {
    if (threeCtrlMode.value === targetMode)
      threeSet(targetMode)
    else
      threeCtrlMode.value = targetMode
  }
}
</script>

<template>
  <div :class="['w-full flex items-center self-end justify-end gap-2', props.variant === 'desktop' && 'flex-1']">
    <Transition name="fade">
      <div v-if="controlEnabled?.enabled.value" :class="['w-full flex justify-between gap-2']">
        <Button
          v-for="control in visibleControls"
          :key="control"
          :aria-pressed="controlEnabled.mode.value === control"
          :color="controlEnabled.mode.value === control ? 'primary' : 'neutral'"
          variant="secondary"
          block
          @click="handleViewControlsToggle(control)"
        >
          {{ controlLabel(control) }}
        </Button>
      </div>
    </Transition>
    <button
      v-if="props.variant === 'desktop'"
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
