import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

import { PiniaColada } from '@pinia/colada'
import Tres from '@tresjs/core'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import '@unocss/reset/tailwind.css'
import 'splitpanes/dist/splitpanes.css'
import 'vue-sonner/style.css'
import './styles/main.css'
import 'uno.css'
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

// Dev-only CORS workaround: rewrite localhost backend fetch URLs to go
// through the Vite dev server proxy instead of hitting the backend
// directly. In production (packaged Electron) CORS doesn't apply.
if (import.meta.env.DEV) {
  const originalFetch = globalThis.fetch
  const LOCALHOST_BACKEND_RE = /^https?:\/\/(localhost|127\.0\.0\.1):3001(\/v1\/.*)$/
  globalThis.fetch = function devFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const rewritten = url.replace(LOCALHOST_BACKEND_RE, '$2')
    if (rewritten !== url) {
      return originalFetch(rewritten, init)
    }
    return originalFetch(input, init)
  }
}

const pinia = createPinia()

const router = createRouter({
  history: createWebHashHistory(),
  // TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
  routes: setupLayouts(routes as RouteRecordRaw[]),
})

createApp(App)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(PiniaColada)
  .use(i18n)
  .use(Tres)
  .mount('#app')
