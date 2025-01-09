import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import Tres from '@tresjs/core'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './main.css'

const pinia = createPinia()

// TODO: messages
const i18n = createI18n({
  locale: 'en',
  messages: {
    en: {
      hello: 'Hello, world!',
    },
  },
})

createApp(App)
  .use(MotionPlugin)
  .use(autoAnimatePlugin)
  .use(pinia)
  .use(i18n)
  .use(Tres)
  .mount('#app')
