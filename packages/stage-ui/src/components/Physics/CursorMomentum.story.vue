<script setup lang="ts">
import { ref } from 'vue'

import CursorMomentum from './CursorMomentum.vue'

// Example components that use momentum
const rotatingBox = ref(null)
const floatingBall = ref(null)
const pulsingCircle = ref(null)
</script>

<template>
  <Story
    title="Cursor Momentum"
    group="physics"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="rotating-box"
      title="Rotating Box"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorMomentum
          v-slot="{ currentValue }"
          :base-speed="0.1"
          :friction="0.95"
          :momentum-factor="0.005"
        >
          <div
            ref="rotatingBox"
            class="h-20 w-20 bg-primary-500/20"
            :style="{
              transform: `rotate(${currentValue}deg)`,
            }"
          />
        </CursorMomentum>
      </div>
    </Variant>

    <Variant
      id="floating-ball"
      title="Floating Ball"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorMomentum
          v-slot="{ momentum }"
          :base-speed="0.5"
          :friction="0.98"
          :momentum-factor="0.01"
        >
          <div
            ref="floatingBall"
            class="h-10 w-10 rounded-full bg-primary-500/20"
            :style="{
              transform: `translateY(${Math.sin(momentum * 0.1) * 20}px)`,
            }"
          />
        </CursorMomentum>
      </div>
    </Variant>

    <Variant
      id="pulsing-circle"
      title="Pulsing Circle"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorMomentum
          v-slot="{ momentum }"
          :base-speed="1"
          :friction="0.9"
          :momentum-factor="0.008"
        >
          <div
            ref="pulsingCircle"
            class="h-16 w-16 rounded-full bg-primary-500/20"
            :style="{
              transform: `scale(${0.8 + (momentum * 0.2)})`,
            }"
          />
        </CursorMomentum>
      </div>
    </Variant>

    <Variant
      id="test-dummy"
      title="Test Dummy Marker"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorMomentum
          v-slot="{ currentValue }"
          :base-speed="0.1"
          :friction="0.95"
          :momentum-factor="0.005"
        >
          <div
            class="crash-test-dummy"
            :style="{
              width: '40px',
              height: '40px',
              transform: `rotateX(45deg) rotate(${currentValue}deg)`,
            }"
          >
            <div class="marker" />
          </div>
        </CursorMomentum>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.crash-test-dummy {
  display: inline-block;
  position: relative;
  transform-style: preserve-3d;
}

.crash-test-dummy .marker {
  position: absolute;
  inset: 0;
  background: conic-gradient(#ffeb3b 0deg 90deg, #000 90deg 180deg, #ffeb3b 180deg 270deg, #000 270deg 360deg);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(185, 185, 185, 0.2);
}

.dark .crash-test-dummy .marker {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
</style>
