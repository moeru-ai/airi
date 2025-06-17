import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './styles/main.css'

const pinia = createPinia()

createApp(App).use(pinia).mount('#app')
