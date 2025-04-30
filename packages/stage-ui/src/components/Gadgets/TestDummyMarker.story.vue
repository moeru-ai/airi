<script setup lang="ts">
import Volumed from '../Graphics/Volumed.vue'
import CursorMomentum from '../Physics/CursorMomentum.vue'
import TestDummyMarker from './TestDummyMarker.vue'
import TestDummyMarkerFlat from './TestDummyMarkerFlat.vue'
</script>

<template>
  <Story
    title="Test Dummy Marker"
    group="gadgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="flat"
      title="Flat Version"
    >
      <div class="h-40 flex items-center justify-center">
        <TestDummyMarkerFlat :size="40" />
      </div>
    </Variant>

    <Variant
      id="3d-basic"
      title="3D Basic"
    >
      <div class="h-40 flex items-center justify-center">
        <Volumed :perspective="800">
          <TestDummyMarkerFlat :size="40" />
        </Volumed>
      </div>
    </Variant>

    <Variant
      id="3d-tilted"
      title="3D Tilted"
    >
      <div class="h-40 flex items-center justify-center">
        <Volumed
          :perspective="800"
          transform="rotateX(45deg)"
        >
          <TestDummyMarkerFlat :size="40" />
        </Volumed>
      </div>
    </Variant>

    <Variant
      id="with-momentum"
      title="With Cursor Momentum"
    >
      <div class="h-40 flex items-center justify-center">
        <CursorMomentum
          v-slot="{ currentValue }"
          :base-speed="0.1"
          :friction="0.95"
          :momentum-factor="0.005"
        >
          <Volumed
            :perspective="800"
            transform="rotateX(45deg)"
          >
            <TestDummyMarkerFlat
              :size="40"
              :style="{
                transform: `rotate(${currentValue}deg)`,
              }"
            />
          </Volumed>
        </CursorMomentum>
      </div>
    </Variant>

    <Variant
      id="original"
      title="Original Implementation"
    >
      <div class="h-40 flex items-center justify-center">
        <TestDummyMarker />
      </div>
    </Variant>
  </Story>
</template>
