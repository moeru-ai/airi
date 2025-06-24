import type { Plugin } from 'vue'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { MotionPlugin } from '@vueuse/motion'

import ThemeColorsHueControl from './ThemeColorsHueControl.vue'

import 'uno.css'
import '@unocss/reset/tailwind.css'
import './main.css'
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  app.use(autoAnimatePlugin as unknown as Plugin)

  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
})
