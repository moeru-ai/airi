import Tres from '@tresjs/core'
import NProgress from 'nprogress'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'
import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

const pinia = createPinia()
const router = createRouter({ routes: setupLayouts(routes), history: createWebHistory() })

router.beforeEach((to, from) => {
  if (to.path !== from.path)
    NProgress.start()
})

router.afterEach(() => {
  NProgress.done()
})

router.isReady()
  .then(async () => {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  })
  .catch(() => { })

createApp(App)
  .use(router)
  .use(pinia)
  .use(i18n)
  .use(Tres)
  .mount('#app')
