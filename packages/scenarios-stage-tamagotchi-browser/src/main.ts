import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'

const router = createRouter({
  routes,
  history: createWebHistory(),
})

createApp(App)
  .use(router)
  .mount('#app')
