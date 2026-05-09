<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted } from 'vue'

import { useModelStore } from '../../stores/model-store'
import { controlConfig as conf, useThreeViewControl } from '../../stores/view-control'

const { cameraDistance, cameraFOV, modelOffset, viewControlsEnabled, viewControlMode, set: setValue } = useThreeViewControl()
const { sceneMutationLocked } = storeToRefs(useModelStore())

const controlledValue = computed({
  get() {
    switch (viewControlMode.value) {
      case 'x':
        return modelOffset.value.x
      case 'y':
        return modelOffset.value.y
      case 'z':
        return modelOffset.value.z
      case 'cameraDistance':
        return cameraDistance.value
      case 'cameraFOV':
        return cameraFOV.value
    }
  },
  set(value) {
    if (sceneMutationLocked.value)
      return
    setValue(viewControlMode.value, value)
  },
})

const formattedValue = computed(() => {
  return conf[viewControlMode.value].format(controlledValue.value)
})

onUnmounted(() => {
  viewControlsEnabled.value = false
})
</script>

<template>
  <Transition name="fade-side-pops-in">
    <fieldset v-if="viewControlsEnabled">
      <Transition name="fade-side-pops-in" mode="out-in">
        <div :key="viewControlMode" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange
            v-model="controlledValue" :min="conf[viewControlMode].min" :max="conf[viewControlMode].max"
            :disabled="sceneMutationLocked" :step="conf[viewControlMode].step" handle-wheel data-direction="vertical"
            h="50%" write-vertical-left
          />
          <div
            class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0
            transition="all duration-200 ease-in-out"
          >
            {{ formattedValue }}
          </div>
        </div>
      </Transition>
    </fieldset>
  </Transition>
</template>

<style scoped>
.fade-side-pops-in-enter-active,
.fade-side-pops-in-leave-active {
  transition: all 0.2s ease-in-out;
}

.fade-side-pops-in-enter-from,
.fade-side-pops-in-leave-to {
  opacity: 0;
  transform: translateX(-100%) scale(0.8);
}

.fade-side-pops-in-enter-to,
.fade-side-pops-in-leave-from {
  opacity: 1;
  transform: translateX(0) scale(1);
}
</style>
