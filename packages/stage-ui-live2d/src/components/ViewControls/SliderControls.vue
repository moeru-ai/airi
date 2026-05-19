<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { computed, onUnmounted } from 'vue'

import { defaultControlConfig as conf, formatter, useL2dViewControl } from '../../stores'

const { scale, position, viewControlsEnabled, viewControlMode, set: setValue } = useL2dViewControl()

const controlledValue = computed({
  get() {
    switch (viewControlMode.value) {
      case 'x':
        return position.value.x
      case 'y':
        return position.value.y
      case 'scale':
        return scale.value
      default: throw new Error(`Unexpected control key: ${viewControlMode.value}`)
    }
  },
  set(value) {
    setValue(viewControlMode.value, value)
  },
})

const formattedValue = computed(() => {
  return formatter[viewControlMode.value](controlledValue.value)
})

onUnmounted(() => {
  viewControlsEnabled.value = false
})
</script>

<template>
  <Transition name="fade-side-pops-in">
    <div v-if="viewControlsEnabled">
      <Transition name="fade-side-pops-in" mode="out-in">
        <div :key="viewControlMode" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange
            v-model="controlledValue" :min="conf[viewControlMode].min" :max="conf[viewControlMode].max" :step="conf[viewControlMode].step" handle-wheel
            data-direction="vertical" h="50%" write-vertical-left
          />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ formattedValue }}
          </div>
        </div>
      </Transition>
    </div>
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
