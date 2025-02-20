import Tres from '@tresjs/core'
import { MotionPlugin } from '@vueuse/motion'
import { createApp } from 'vue'

import App from './App.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

createApp(App)
  .use(MotionPlugin)
  .use(Tres)
  .mount('#app')
