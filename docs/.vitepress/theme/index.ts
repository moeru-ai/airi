import type { Theme } from 'vitepress'

import Layout from '../custom/Layout.vue'

import '@unocss/reset/tailwind.css'
import 'uno.css'
import './style.css'

export default {
  Layout,
  enhanceApp(_ctx) {
  },
} satisfies Theme
