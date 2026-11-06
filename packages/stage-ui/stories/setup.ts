import type { Plugin } from 'vue'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { useMutationObserver } from '@vueuse/core'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'

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
import '@fontsource/dm-serif-display/index.css'
import '@fontsource/gugi/index.css'
import '@fontsource/kiwi-maru/index.css'
import '@fontsource/m-plus-rounded-1c/index.css'
import '@fontsource/maple-mono/index.css'
import '@fontsource-variable/nunito/index.css'

// NOTICE:
// `useTheme` re-applies its stored scheme and removes the Histoire `dark` class.
// Mirror the Histoire `htw-dark` state (@histoire/app/dist/bundled/util/dark.js) to `dark`.
// Do not write `useTheme`: stories share an origin with stage-web and would change its saved theme.
// Remove when Histoire can drive an app-owned theme store.
function syncHistoireDark() {
  const root = document.documentElement
  root.classList.toggle('dark', root.classList.contains('htw-dark'))
}

// `setup.server.ts` re-exports this module for story collection in Node, where `document` does not exist.
if (typeof document !== 'undefined') {
  syncHistoireDark()
  useMutationObserver(document.documentElement, syncHistoireDark, { attributeFilter: ['class'] })
}

export const setupVue3 = defineSetupVue3(({ app }) => {
  // Each story app gets its own Pinia, because components such as the chat history items read stores in setup.
  app.use(createPinia())
  app.use(MotionPlugin)
  app.use(i18n)
  // TODO: Fix autoAnimatePlugin type error
  app.use(autoAnimatePlugin as unknown as Plugin)

  app.component('ThemeColorsHueControl', ThemeColorsHueControl)
  app.component('CharacterCardColorControls', CharacterCardColorControls)
})
