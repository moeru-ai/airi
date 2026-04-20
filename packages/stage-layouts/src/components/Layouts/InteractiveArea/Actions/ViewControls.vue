<script lang="ts" setup>
import { supportedControl as l2dSupportedCtrl, useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const { stageModelRenderer, stageViewControlsEnabled: vrmViewCtrlEnabled } = storeToRefs(useSettings())
const { viewControlsEnabled: l2dViewCtrlEnabled, viewControlMode: l2dViewCtrlMode, reset: l2dReset } = useL2dViewControl()
const controlEnabled = computed(() => {
  if (stageModelRenderer.value === 'live2d')
    return { enabled: l2dViewCtrlEnabled, mode: l2dViewCtrlMode, supported: l2dSupportedCtrl, reset: l2dReset }
  if (stageModelRenderer.value === 'vrm')
    return { enabled: vrmViewCtrlEnabled, mode: ref('scale'), supported: ['x', 'y', 'z', 'scale'], reset: () => {} }
  return null
})

function handleViewControlsToggle(targetMode: string) {
  if (!controlEnabled.value || !controlEnabled.value.supported.includes(targetMode as any))
    return
  if (controlEnabled.value.mode.value === targetMode) {
    controlEnabled.value.reset(controlEnabled.value.mode.value as any) // already guarded
    return
  }
  controlEnabled.value.mode.value = targetMode
}

// watch()
</script>

<template>
  <div w-full flex flex-1 items-center self-end justify-end gap-2>
    <Transition name="fade">
      <div v-if="controlEnabled?.enabled.value" w-full flex justify-between gap-2>
        <Button variant="secondary-muted" :toggled="controlEnabled.mode.value === 'x'" w-full @click="handleViewControlsToggle('x')">
          X
        </Button>
        <Button variant="secondary-muted" :toggled="controlEnabled.mode.value === 'y'" w-full @click="handleViewControlsToggle('y')">
          Y
        </Button>
        <Button v-if="controlEnabled.supported.includes('z' as any)" variant="secondary-muted" :toggled="controlEnabled.mode.value === 'z'" w-full @click="handleViewControlsToggle('z')">
          Z
        </Button>
        <Button variant="secondary-muted" :toggled="controlEnabled.mode.value === 'scale'" w-full @click="handleViewControlsToggle('scale')">
          Scale
        </Button>
      </div>
    </Transition>
    <button
      w-fit flex items-center self-end justify-center justify-self-end rounded-xl p-2 backdrop-blur-md
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
