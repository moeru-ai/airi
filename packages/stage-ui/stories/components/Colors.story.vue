<script setup lang="ts">
import ThemeColorsHueControl from './ThemeColorsHueControl.vue'

const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const opacities = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
</script>

<template>
  <Story
    group="design-system"
    title="Colors"
    :layout="{ type: 'single', iframe: false }"
    responsive-disabled
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant title="Shades in opacities">
      <div grid="~ cols-12 rows-12" class="transparency-grid" items-center justify-center>
        <template
          v-for="(shade, c) in shades"
          :key="`primary-${shade}`"
        >
          <div self-end p-4 text-center font-mono :style="{ gridArea: `1 / ${c + 2} / span 1 / span 1` }">
            {{ shade }}
          </div>
        </template>

        <template
          v-for="(opacity, r) in opacities"
          :key="`primary-${opacity}`"
        >
          <div p-4 text-right font-mono :style="{ gridArea: `${r + 2} / 1 / span 1 / span 1` }">
            /{{ opacity }}
          </div>

          <div
            v-for="(shade, c) in shades"
            :key="`primary-${shade}/${opacity}`"
            class="cursor-crosshair [&_.color-label]:hover:op-100" :class="[`bg-primary-${shade}/${opacity}`]"
            h-82px flex items-center justify-center p-4
            :style="{ gridArea: `${r + 2} / ${c + 2} / span 1 / span 1` }"
          >
            <div

              bg="light op-80"
              rounded-md px-1 py-0.5 text-xs text-primary-700 font-mono op-0 dark:bg-dark dark:text-primary-300
              transition="opacity duration-100"
              class="color-label"
            >
              {{ shade }}/{{ opacity }}
            </div>
          </div>
        </template>
      </div>
    </Variant>
  </Story>
</template>

<style>
.transparency-grid::before {
  content: '';
  grid-area: 2 / 2 / span 11 / span 11;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(45deg, oklch(90% 0 0) 25%, transparent 25%),
    linear-gradient(-45deg, oklch(90% 0 0) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, oklch(90% 0 0) 75%),
    linear-gradient(-45deg, transparent 75%, oklch(90% 0 0) 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
  background-color: oklch(100% 0 0);
}

.dark .transparency-grid::before {
  background-image: linear-gradient(45deg, oklch(40% 0 0) 25%, transparent 25%),
    linear-gradient(-45deg, oklch(40% 0 0) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, oklch(40% 0 0) 75%),
    linear-gradient(-45deg, transparent 75%, oklch(40% 0 0) 75%);
  background-color: oklch(25% 0 0);
}
</style>
