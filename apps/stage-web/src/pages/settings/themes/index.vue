<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { DEFAULT_THEME_COLORS_HUE, useSettings } from '@proj-airi/stage-ui/stores'
import { converter } from 'culori'
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'radix-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const settings = useSettings()

interface ColorPreset {
  name: string
  description: string
  colors: Array<{
    hex: string
    name: string
  }>
}

const colorPresets = computed<ColorPreset[]>(() => [
  {
    name: t('settings.pages.themes.sections.section.theme-presets.preset.morandi.title'),
    description: t('settings.pages.themes.sections.section.theme-presets.preset.morandi.description'),
    colors: [
      { hex: '#A5978B', name: 'Taupe' },
      { hex: '#D8CAAF', name: 'Beige' },
      { hex: '#B8B4A7', name: 'Ash Grey' },
      { hex: '#C4BCB1', name: 'Light Taupe' },
      { hex: '#E5DED8', name: 'Ivory' },
      { hex: '#9A8F7D', name: 'Olive Grey' },
      { hex: '#BEB5A7', name: 'Sand' },
      { hex: '#C9C0B6', name: 'Warm Grey' },
    ],
  },
  {
    name: t('settings.pages.themes.sections.section.theme-presets.preset.monet.title'),
    description: t('settings.pages.themes.sections.section.theme-presets.preset.monet.description'),
    colors: [
      { hex: '#7A9EAF', name: 'Sky Blue' },
      { hex: '#B8C7CC', name: 'Mist' },
      { hex: '#D4B79C', name: 'Sand' },
      { hex: '#8B9D77', name: 'Moss Green' },
      { hex: '#C7D5CB', name: 'Water Lily' },
      { hex: '#E6D0B1', name: 'Wheat' },
      { hex: '#94A7B1', name: 'Slate Blue' },
      { hex: '#B4C8C3', name: 'Sage' },
    ],
  },
  {
    name: t('settings.pages.themes.sections.section.theme-presets.preset.japanese.title'),
    description: t('settings.pages.themes.sections.section.theme-presets.preset.japanese.description'),
    colors: [
      { hex: '#D9B48F', name: 'Tan' },
      { hex: '#B5917A', name: 'Warm Taupe' },
      { hex: '#8C7A6B', name: 'Umber' },
      { hex: '#A17F5F', name: 'Coffee' },
      { hex: '#B98C46', name: 'Bronze' },
      { hex: '#C7A252', name: 'Gold' },
      { hex: '#DAB300', name: 'Mustard' },
      { hex: '#D19826', name: 'Amber' },
    ],
  },
  {
    name: t('settings.pages.themes.sections.section.theme-presets.preset.nordic.title'),
    description: t('settings.pages.themes.sections.section.theme-presets.preset.nordic.description'),
    colors: [
      { hex: '#9BA7B0', name: 'Nordic Blue' },
      { hex: '#C1CBD4', name: 'Ice' },
      { hex: '#A5ADB6', name: 'Fjord' },
      { hex: '#8B959E', name: 'Steel' },
      { hex: '#D4DCE4', name: 'Glacier' },
      { hex: '#7F8A94', name: 'Slate' },
      { hex: '#B3BCC6', name: 'Cloud' },
      { hex: '#98A4AE', name: 'Stone' },
    ],
  },
  {
    name: t('settings.pages.themes.sections.section.theme-presets.preset.chinese.title'),
    description: t('settings.pages.themes.sections.section.theme-presets.preset.chinese.description'),
    colors: [
      { hex: '#E4C6D0', name: '霞光红 (Rosy Dawn)' },
      { hex: '#A61B29', name: '枣红 (Chinese Red)' },
      { hex: '#5D513C', name: '黄栌 (Smoky Brown)' },
      { hex: '#789262', name: '竹青 (Bamboo Green)' },
      { hex: '#1C0D1A', name: '乌梅紫 (Dark Purple)' },
      { hex: '#F7C242', name: '缃色 (Golden Yellow)' },
      { hex: '#62A9DD', name: '青冥 (Azure Blue)' },
      { hex: '#8C4B3C', name: '赭石 (Ochre)' },
    ],
  },
])

function resetToDefault() {
  settings.themeColorsHue = DEFAULT_THEME_COLORS_HUE
  settings.themeColorsHueDynamic = false
}

function applyPrimaryColorFromHex(color: string) {
  // Convert hex color to OKLCH using culori's converter
  const oklch = converter('oklch')(color)

  if (!oklch)
    return

  // Extract hue from OKLCH color
  const { h } = oklch

  if (!h)
    return

  // Update theme settings
  settings.themeColorsHue = h
  settings.themeColorsHueDynamic = false
}

/**
 * Check if a color is currently selected based on its hue value
 * @param hexColor Hex color code to check
 * @returns True if the color's hue matches the current theme hue
 */
function isColorSelected(hexColor: string): boolean {
  // If dynamic coloring is enabled, no preset color is manually selected
  if (settings.themeColorsHueDynamic)
    return false

  // Convert hex color to OKLCH
  const oklch = converter('oklch')(hexColor)
  if (!oklch || !oklch.h)
    return false

  // Compare hue values with a small tolerance for floating point comparison
  const hueDifference = Math.abs(oklch.h - settings.themeColorsHue)
  return hueDifference < 0.01 || hueDifference > 359.99
}
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">{{ t('settings.title') }}</span>
      </div>
      <div text-3xl font-semibold>
        {{ t('settings.pages.themes.title') }}
      </div>
    </h1>
  </div>

  <div flex-col>
    <Collapsable mt-4 w-full :default="true">
      <template #trigger="slotProps">
        <button
          bg="zinc-100 dark:zinc-800"
          hover="bg-zinc-200 dark:bg-zinc-700"
          transition="all ease-in-out duration-250"
          w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
          class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ row 1" items-center gap-1.5>
            <div
              i-solar:pallete-2-bold-duotone class="provider-icon size-6"
              transition="filter duration-250 ease-in-out"
            />
            <div>
              {{ t('settings.pages.themes.sections.section.custom-color.title') }}
            </div>
          </div>
          <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
            <div i-solar:alt-arrow-down-bold-duotone />
          </div>
        </button>
      </template>
      <div p-4>
        <div class="mb-2 text-sm font-medium">
          {{ t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.label') }}
        </div>

        <div flex="~ col gap-4">
          <input
            v-model="settings.themeColorsHue"
            type="range"
            min="0"
            max="360"
            step="0.01"
            class="theme-hue-slider h-10 w-full"
            :disabled="settings.themeColorsHueDynamic"
            :class="{ 'opacity-25 cursor-not-allowed': settings.themeColorsHueDynamic }"
          >

          <div h-10 w-full flex overflow-hidden rounded-lg>
            <div bg="primary-50" class="primary-color-bar" text-black>
              50
            </div>
            <div bg="primary-100" class="primary-color-bar" text-black>
              100
            </div>
            <div bg="primary-200" class="primary-color-bar" text-black>
              200
            </div>
            <div bg="primary-300" class="primary-color-bar" text-black>
              300
            </div>
            <div bg="primary-400" class="primary-color-bar" text-black>
              400
            </div>
            <div bg="primary-500" class="primary-color-bar" text-black>
              500
            </div>
            <div bg="primary-600" class="primary-color-bar" text-white>
              600
            </div>
            <div bg="primary-700" class="primary-color-bar" text-white>
              700
            </div>
            <div bg="primary-800" class="primary-color-bar" text-white>
              800
            </div>
            <div bg="primary-900" class="primary-color-bar" text-white>
              900
            </div>
            <div bg="primary-950" class="primary-color-bar" text-white>
              950
            </div>
          </div>

          <div h-10 w-full flex overflow-hidden rounded-lg class="transparency-grid">
            <div bg="primary-500/5" class="primary-color-bar" text-black>
              500/5
            </div>
            <div bg="primary-500/10" class="primary-color-bar" text-black>
              500/10
            </div>
            <div bg="primary-500/20" class="primary-color-bar" text-black>
              500/20
            </div>
            <div bg="primary-500/30" class="primary-color-bar" text-black>
              500/30
            </div>
            <div bg="primary-500/40" class="primary-color-bar" text-black>
              500/40
            </div>
            <div bg="primary-500/50" class="primary-color-bar" text-black>
              500/50
            </div>
            <div bg="primary-500/60" class="primary-color-bar" text-black>
              500/60
            </div>
            <div bg="primary-500/70" class="primary-color-bar" text-black>
              500/70
            </div>
            <div bg="primary-500/80" class="primary-color-bar" text-black>
              500/80
            </div>
            <div bg="primary-500/90" class="primary-color-bar" text-black>
              500/90
            </div>
            <div bg="primary-500" class="primary-color-bar" text-black>
              500
            </div>
          </div>
        </div>

        <div mt-4 class="flex items-center justify-end gap-4">
          <label class="relative inline-flex cursor-pointer items-center">
            <input
              v-model="settings.themeColorsHueDynamic"
              type="checkbox"
              class="peer sr-only"
            >
            <div
              class="peer-checked:bg-primary-500 h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white dark:bg-neutral-600 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"
            />
            <span class="ml-2 text-sm font-medium">{{ t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.rgb-on.title') }}</span>
          </label>

          <button
            class="rounded-md bg-neutral-100 px-3 py-1.5 text-sm transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            @click="resetToDefault"
          >
            {{ t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.reset.label') }}
          </button>
        </div>
      </div>
    </Collapsable>

    <Collapsable mt-4 w-full :default="true">
      <template #trigger="slotProps">
        <button
          bg="zinc-100 dark:zinc-800"
          hover="bg-zinc-200 dark:bg-zinc-700"
          transition="all ease-in-out duration-250"
          w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
          class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ row 1" items-center gap-1.5>
            <div
              i-solar:magic-stick-2-bold-duotone class="provider-icon size-6"
              transition="filter duration-250 ease-in-out"
            />
            <div>
              {{ t('settings.pages.themes.sections.section.theme-presets.title') }}
            </div>
          </div>
          <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
            <div i-solar:alt-arrow-down-bold-duotone />
          </div>
        </button>
      </template>

      <div p-4 flex="~ col gap-4">
        <div
          v-for="preset in colorPresets"
          :key="preset.name"
          flex="~ row"
          bg="neutral-100 dark:neutral-800"
          hover="bg-neutral-200 dark:bg-neutral-700"
          transition="all ease-in-out duration-250"
          cursor-pointer items-center justify-between gap-4 rounded-lg px-4 py-3
        >
          <div>
            <div text-base font-medium>
              {{ preset.name }}
            </div>
            <div text="sm neutral-500">
              {{ preset.description }}
            </div>
          </div>
          <div flex="~ row" gap-2>
            <TooltipProvider v-for="color in preset.colors" :key="color.hex">
              <TooltipRoot>
                <TooltipTrigger>
                  <div
                    :style="{ backgroundColor: color.hex }"
                    class="size-6 cursor-pointer rounded-full transition-all duration-250 ease-in-out" :class="[
                      isColorSelected(color.hex)
                        ? 'scale-150 z-10 mx-1'
                        : 'hover:scale-110',
                    ]"
                    @click="applyPrimaryColorFromHex(color.hex)"
                  />
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent class="rounded-lg bg-white px-3 py-1.5 text-sm shadow-md dark:bg-neutral-800">
                    {{ color.name }}
                    <TooltipArrow class="fill-white dark:fill-neutral-800" />
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </Collapsable>
  </div>

  <div text="neutral-200/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:paintbrush />
  </div>
</template>

<style>
.primary-color-bar {
  --at-apply: w-full h-full flex-1 flex items-center justify-center;
}

.theme-hue-slider {
  --at-apply: rounded-lg appearance-none;
  background: linear-gradient(
    to right,
    oklch(85% 0.2 0),
    oklch(85% 0.2 60),
    oklch(85% 0.2 120),
    oklch(85% 0.2 180),
    oklch(85% 0.2 240),
    oklch(85% 0.2 300),
    oklch(85% 0.2 360)
  );
}

.theme-hue-slider::-webkit-slider-thumb {
  --at-apply: w-2 h-12 appearance-none rounded-md bg-neutral-500/80 dark: bg-neutral-400/80 cursor-pointer shadow-md
    border-2 border-white hover: bg-neutral-500 dark: hover: bg-neutral-400 transition-colors duration-200;
}

.theme-hue-slider::-moz-range-thumb {
  --at-apply: w-2 h-12 bg-neutral-500/80 rounded-md dark: bg-neutral-400/80 cursor-pointer shadow-md border-2
    border-white border-box hover: bg-neutral-500 dark: hover: bg-neutral-400 transition-colors duration-200;
}

.transparency-grid {
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
  background-color: #fff;
}
</style>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
