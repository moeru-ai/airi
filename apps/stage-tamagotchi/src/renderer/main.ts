import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'
import buildTime from '~build/time'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { MotionPlugin } from '@vueuse/motion'
import { abbreviatedSha, branch } from '~build/git'
import { version } from '~build/package'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import './modules/posthog'

// eslint-disable-next-line perfectionist/sort-imports
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
import '@fontsource-variable/comfortaa'
import '@fontsource/dm-mono'
import '@fontsource/dm-serif-display'
import '@fontsource/gugi'
import '@fontsource/kiwi-maru'
import '@fontsource/m-plus-rounded-1c'
import '@fontsource/sniglet'

const pinia = createPinia()

// Initialize analytics
const analyticsStore = useSharedAnalyticsStore(pinia)
analyticsStore.initialize({
  version: version ?? 'dev',
  commit: abbreviatedSha,
  branch,
  builtOn: buildTime.toISOString(),
})

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
  .use(i18n)
  .use(Tres)
  .mount('#app')
