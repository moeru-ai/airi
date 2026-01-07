<script setup lang="ts">
import Volumed from '../graphics/volumed.vue'
import CursorMomentum from '../physics/cursor-momentum.vue'
import TestDummyMarkerFlat from './test-dummy-marker-flat.vue'
</script>

<template>
  <CursorMomentum v-slot="{ currentValue }" :base-speed="0.1" :friction="0.95" :momentum-factor="0.0005">
    <Volumed :perspective="800" transform="rotateX(45deg) translateY(3px)">
      <TestDummyMarkerFlat :size="24" :style="{ transform: `rotate(${currentValue}deg)` }" />
    </Volumed>
  </CursorMomentum>
</template>
