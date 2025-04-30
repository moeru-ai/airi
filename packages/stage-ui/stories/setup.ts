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
  app.use(autoAnimatePlugin)

  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
})
