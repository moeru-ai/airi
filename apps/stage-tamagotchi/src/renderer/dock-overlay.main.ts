import { createPinia } from 'pinia'
import { createApp } from 'vue'

import DockOverlayApp from './dock-overlay-app.vue'

// eslint-disable-next-line perfectionist/sort-imports
import '@unocss/reset/tailwind.css'
import './styles/hue.css'
import './styles/main.css'
import 'uno.css'

createApp(DockOverlayApp)
  .use(createPinia())
  .mount('#app')
