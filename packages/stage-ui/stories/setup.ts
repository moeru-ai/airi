import { defineSetupVue3 } from '@histoire/plugin-vue'

import ThemeColorsHueControl from './ThemeColorsHueControl.vue'

import 'uno.css'
import '@unocss/reset/tailwind.css'
import './main.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
})
