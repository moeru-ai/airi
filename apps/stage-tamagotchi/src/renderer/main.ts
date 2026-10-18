import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { PiniaColada } from '@pinia/colada'
import { pushToTalkTriggerKey } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'
import { browserAuthorizationHandler, registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { piniaPluginTracing, setupSynced } from '@proj-airi/stage-ui/libs/pinia'
import { configureAnalyticsAdapter } from '@proj-airi/stage-ui/libs/product-signals'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { nestFullscreenSurfaces } from './components/fullscreen/surfaces'
import { i18n } from './modules/i18n'
import { resolveRendererWindowContext } from './window-context'

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

configureAnalyticsAdapter(async (options) => {
  const { createOpenpanelAdapter } = await import('@proj-airi/stage-ui/libs/product-signals/openpanel')
  return createOpenpanelAdapter(options)
})
registerAuthorizationHandler(browserAuthorizationHandler)

const windowContext = resolveRendererWindowContext()
const pinia = createPinia()
const synced = setupSynced({
  leadership: windowContext.leadership,
})
pinia.use(synced.pinia)
if (import.meta.env.DEV)
  pinia.use(piniaPluginTracing)

/** The app routes with layouts. A window that hosts the fullscreen mode also routes the surfaces under its own page. */
function windowRoutes(appRoutes: RouteRecordRaw[]) {
  const withLayouts = setupLayouts(appRoutes)
  return windowContext.fullscreenHost ? nestFullscreenSurfaces(withLayouts, windowContext.fullscreenHost) : withLayouts
}

const router = createRouter({
  history: createWebHashHistory(),
  // TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
  routes: windowRoutes(routes as RouteRecordRaw[]),
})

if (import.meta.hot) {
  handleHotUpdate(router, (updatedRoutes) => {
    router.clearRoutes()
    for (const route of windowRoutes(updatedRoutes))
      router.addRoute(route)
  })
}

createApp(App)
  .use(synced.vue)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(PiniaColada)
  .use(i18n)
  .use(Tres)
  .use(trackButtonPlugin)
  // The stage window registers a global hold shortcut. Every window shares this app, so the settings window offers the mode too.
  .provide(pushToTalkTriggerKey, true)
  .mount('#app')
