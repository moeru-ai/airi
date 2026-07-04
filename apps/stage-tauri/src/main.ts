import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { i18n } from './modules/i18n'
import './styles.css'
import 'uno.css'

createApp(App).use(createPinia()).use(i18n).mount('#app')
