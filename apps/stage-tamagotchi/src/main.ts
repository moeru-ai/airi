import { initializeApp } from '@proj-airi/stage-ui/services'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import '@unocss/reset/tailwind.css'
import 'uno.css'
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

const pinia = createPinia()

const router = createRouter({
  history: createWebHashHistory(),
  routes: setupLayouts(routes),
})

// Initialize and mount the app using the shared initialization logic
initializeApp(App, {
  router,
  pinia,
  i18n,
}).then((app) => {
  app.mount('#app')
})
