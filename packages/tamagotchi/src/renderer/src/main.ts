import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import Tres from '@tresjs/core'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './main.css'

const pinia = createPinia()

createApp(App)
  .use(MotionPlugin)
  .use(autoAnimatePlugin)
  .use(pinia)
  // TODO: .use(i18n)
  .use(Tres)
  .mount('#app')
