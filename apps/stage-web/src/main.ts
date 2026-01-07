import type { Plugin } from 'vue'
import type { Router, RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'
import NProgress from 'nprogress'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import './modules/posthog'

// eslint-disable-next-line perfectionist/sort-imports
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@unocss/reset/tailwind.css'
import 'splitpanes/dist/splitpanes.css'
import './styles/main.css'
import 'uno.css'

const pinia = createPinia()

// TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
const routeRecords = setupLayouts(routes as RouteRecordRaw[])

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

createApp(App)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(i18n)
  .use(Tres)
  .mount('#app')

if (import.meta.env.DEV && !import.meta.env.SSR) {
  function captureEvents(el: HTMLElement) {
    // Force `pointer-events: auto` as DismissableLayer in Reka UI adds
    // `pointer-events: none` to document body.
    el.style.pointerEvents = 'auto'

    // We need to capture events inside elements like devtools to prevent them
    // from leaking to other layers (like DismissableLayer in Reka UI).
    //
    // See: https://github.com/unovue/reka-ui/blob/14866201d179b8bae3c8b4346a1ca8eff1c5eaa4/packages/radix-vue/src/DismissableLayer/DismissableLayer.vue#L186-L188
    el.addEventListener('focus', e => e.stopPropagation(), { capture: true })
    el.addEventListener('blur', e => e.stopPropagation(), { capture: true })
    el.addEventListener('pointerdown', e => e.stopPropagation(), { capture: true })
  }

  const observer = new MutationObserver((mutationsList, observer) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const devtoolsContainer = document.getElementById('__vue-devtools-container__')

        if (devtoolsContainer) {
          captureEvents(devtoolsContainer)
          observer.disconnect()
        }
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  // Disconnect on timeout in case the MutationObserver is left here forever.
  // `observer.disconnect()` is idempotent, so it's safe to call it multiple times.
  setTimeout(() => observer.disconnect(), 15 * 1000)
}
