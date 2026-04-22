import type { Plugin } from 'vue'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { MotionPlugin } from '@vueuse/motion'

import CharacterCardColorControls from './components/CharacterCardColorControls.vue'
import ThemeColorsHueControl from './components/ThemeColorsHueControl.vue'

import { i18n } from './modules/i18n'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './styles/main.css'
// Fonts
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@fontsource-variable/dm-sans/index.css'
import '@fontsource-variable/jura/index.css'
import '@fontsource-variable/quicksand/index.css'
import '@fontsource-variable/urbanist/index.css'
import '@fontsource-variable/comfortaa/index.css'
import '@fontsource/dm-mono/index.css'
import '@fontsource/dm-serif-display/index.css'
import '@fontsource/gugi/index.css'
import '@fontsource/kiwi-maru/index.css'
import '@fontsource/m-plus-rounded-1c/index.css'
import '@fontsource-variable/nunito/index.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(MotionPlugin)
  app.use(i18n)
  // TODO: Fix autoAnimatePlugin type error
  app.use(autoAnimatePlugin as unknown as Plugin)

  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
  app.component('CharacterCardColorControls', CharacterCardColorControls)
})
