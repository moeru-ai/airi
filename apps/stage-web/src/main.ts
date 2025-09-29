import type { App as VueApp } from 'vue'
import type { Router } from 'vue-router'

import NProgress from 'nprogress'

import { initializeApp } from '@proj-airi/stage-ui/services'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

const pinia = createPinia()
const routeRecords = setupLayouts(routes)

let router: Router
if (import.meta.env.VITE_APP_TARGET_HUGGINGFACE_SPACE)
  router = createRouter({ routes: routeRecords, history: createWebHashHistory() })
else
  router = createRouter({ routes: routeRecords, history: createWebHistory() })

router.beforeEach((to, from) => {
  if (to.path !== from.path)
    NProgress.start()
})

router.afterEach(() => {
  NProgress.done()
})

// Custom initialization callback for web-specific post-initialization
async function onInitialized(_app: VueApp, router: Router) {
  // Handle PWA registration after router is ready
  router.isReady()
    .then(async () => {
      if (import.meta.env.SSR) {
        return
      }
      if (import.meta.env.VITE_APP_TARGET_HUGGINGFACE_SPACE) {
        return
      }

      const { registerSW } = await import('./modules/pwa')
      registerSW({ immediate: true })
    })
    .catch(() => {})
}

// Initialize and mount the app using the shared initialization logic with web-specific options
initializeApp(App, {
  router,
  pinia,
  i18n,
  onInitialized,
}).then((app) => {
  app.mount('#app')
})
