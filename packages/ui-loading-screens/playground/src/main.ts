import { MotionPlugin } from '@vueuse/motion'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'

const router = createRouter({ routes, history: createWebHashHistory() })

createApp(App)
  .use(MotionPlugin)
  .use(router)
  .mount('#app')
