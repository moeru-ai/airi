import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstVue()],
  setupFile: 'stories/setup.ts',
  tree: {
    groups: [
      {
        id: 'design-system',
        title: 'Design System',
      },
    ],
  },
})
