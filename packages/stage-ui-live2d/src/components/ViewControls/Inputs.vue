<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { onUnmounted } from 'vue'

import { controlConfig, useL2dViewControl } from '../../stores'

const { scale, position, viewControlsEnabled, viewControlMode } = useL2dViewControl()

onUnmounted(() => {
  viewControlsEnabled.value = false
})
</script>

<template>
  <Transition name="fade-side-pops-in">
    <div v-if="viewControlsEnabled">
      <Transition name="fade-side-pops-in" mode="out-in">
        <div v-if="viewControlMode === 'x'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="position.x" :min="controlConfig.x.min" :max="controlConfig.x.max" :step="controlConfig.x.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ controlConfig.x.format(position.x) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'y'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="position.y" :min="controlConfig.y.min" :max="controlConfig.y.max" :step="controlConfig.y.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ controlConfig.y.format(position.y) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'scale'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="scale" :min="controlConfig.scale.min" :max="controlConfig.scale.max" :step="controlConfig.scale.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ controlConfig.scale.format(scale) }}
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
