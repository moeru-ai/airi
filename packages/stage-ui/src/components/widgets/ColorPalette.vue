<script setup lang="ts">
import { DEFAULT_THEME_COLORS_HUE, useSettings } from '@proj-airi/stage-ui/stores/settings'
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

interface Color {
  hex?: string
  name: string
}

defineProps<{
  colors: Color[]
}>()

const settings = useSettings()
</script>

<template>
  <div v-if="colors.length" flex gap-2>
    <TooltipProvider v-for="{ hex, name } in colors" :key="hex || 'default'">
      <TooltipRoot>
        <TooltipTrigger
          transition="all ease-in-out duration-250"
          size-8 cursor-pointer rounded-full bg-primary-500
          :style="hex ? { background: hex } : { '--chromatic-hue': DEFAULT_THEME_COLORS_HUE }"
          :class="settings.isColorSelectedForPrimary(hex) ? 'scale-120 md:scale-150 mx-1' : 'hover:scale-110'"
          @click="settings.applyPrimaryColorFrom(hex)"
        />
        <TooltipPortal>
          <TooltipContent bg="white dark:neutral-800" rounded-lg px-3 py-1.5 text-sm shadow-md>
            {{ name }}
            <TooltipArrow fill-white dark:fill-neutral-800 />
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  </div>
</template>
