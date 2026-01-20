import { createPinia } from 'pinia'
import { createApp } from 'vue'

import DockOverlayApp from './dock-overlay-app.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

createApp(DockOverlayApp)
  .use(createPinia())
  .mount('#app')
