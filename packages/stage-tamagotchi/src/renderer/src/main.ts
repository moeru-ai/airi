import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import Tres from '@tresjs/core'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'
import { i18n } from './modules/i18n'
import '@unocss/reset/tailwind.css'
import 'uno.css'
import './main.css'

const pinia = createPinia()

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

createApp(App)
  .use(MotionPlugin)
  .use(autoAnimatePlugin)
  .use(router)
  .use(pinia)
  .use(i18n)
  .use(Tres)
  .mount('#app')
