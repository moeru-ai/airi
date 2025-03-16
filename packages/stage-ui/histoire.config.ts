import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  routerMode: 'hash',
  plugins: [
    HstVue(),
  ],
  vite: {
    base: '/ui/',
  },
  setupFile: 'stories/setup.ts',
  tree: {
    groups: [
      {
        id: 'design-system',
        title: 'Design System',
      },
      {
        id: 'form',
        title: 'Form',
      },
      {
        id: 'menu',
        title: 'Menu',
      },
      {
        id: 'data-gui',
        title: 'Data GUI',
      },
    ],
  },
})
