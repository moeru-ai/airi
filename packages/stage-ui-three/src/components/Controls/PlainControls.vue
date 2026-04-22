<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { onUnmounted } from 'vue'

import { controlConfig as conf, useThreeViewControl } from '../../stores/view-controls'

const { cameraDistance, cameraFOV, modelOffset, viewControlsEnabled, viewControlMode } = useThreeViewControl()

onUnmounted(() => {
  viewControlsEnabled.value = false
})
</script>

<template>
  <Transition name="fade-side-pops-in">
    <div v-if="viewControlsEnabled">
      <Transition name="fade-side-pops-in" mode="out-in">
        <!-- TODO: generate the controls programmatically, while preserving the transition -->
        <div v-if="viewControlMode === 'x'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="modelOffset.x" :min="conf.x.min" :max="conf.x.max" :step="conf.x.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ conf.x.format(modelOffset.x) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'y'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="modelOffset.y" :min="conf.y.min" :max="conf.y.max" :step="conf.y.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ conf.y.format(modelOffset.y) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'z'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="modelOffset.z" :min="conf.z.min" :max="conf.z.max" :step="conf.z.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ conf.z.format(modelOffset.z) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'cameraDistance'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="cameraDistance" :min="conf.cameraDistance.min" :max="conf.cameraDistance.max" :step="conf.cameraDistance.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ conf.cameraDistance.format(cameraDistance) }}
          </div>
        </div>
        <div v-else-if="viewControlMode === 'cameraFOV'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange v-model="cameraFOV" :min="conf.cameraFOV.min" :max="conf.cameraFOV.max" :step="conf.cameraFOV.step" data-direction="vertical" h="50%" write-vertical-left />
          <div class="round-range-tooltip" top="50%" translate-y="[-50%]" absolute left-10 font-mono op-0 transition="all duration-200 ease-in-out">
            {{ conf.cameraFOV.format(cameraFOV) }}
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
