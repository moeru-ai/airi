import { createApp } from 'vue'
// eslint-disable-next-line import/no-duplicates
import { createRouter, createWebHashHistory } from 'vue-router'
// eslint-disable-next-line import/no-duplicates
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'
import '@unocss/reset/tailwind.css'
import 'uno.css'

const router = createRouter({ routes, history: createWebHashHistory() })

createApp(App)
  .use(router)
  .mount('#app')
