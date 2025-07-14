import type { Plugin } from 'vue'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { MotionPlugin } from '@vueuse/motion'

import CharacterCardColorControls from './components/CharacterCardColorControls.vue'
import ThemeColorsHueControl from './components/ThemeColorsHueControl.vue'

import { i18n } from './modules/i18n'

import 'uno.css'
import '@unocss/reset/tailwind.css'
import './styles/main.css'
// Fonts
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jura'
import '@fontsource-variable/quicksand'
import '@fontsource-variable/urbanist'
import '@fontsource/dm-mono'
import '@fontsource/dm-serif-display'
import '@fontsource/gugi'
import '@fontsource/kiwi-maru'
import '@fontsource/m-plus-rounded-1c'
import '@fontsource/sniglet'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(MotionPlugin)
  app.use(i18n)
  // TODO: Fix autoAnimatePlugin type error
  app.use(autoAnimatePlugin as unknown as Plugin)

  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
  app.component('CharacterCardColorControls', CharacterCardColorControls)
})
