import { HstVue } from '@histoire/plugin-vue'
import { defaultColors, defineConfig } from 'histoire'

export default defineConfig({
  routerMode: 'hash',
  theme: {
    title: 'AIRI UI',
    logo: {
      dark: './public/logo.svg',
      light: './public/logo.svg',
    },
    colors: {
      primary: defaultColors.neutral,
    },
  },
  plugins: [
    HstVue(),
  ],
  vite: {
    base: '/ui/',
  },
  setupFile: {
    browser: 'stories/setup.ts',
    server: 'stories/setup.server.ts',
  },
  viteNodeTransformMode: {
    web: [
      /\.web\.vue$/,
    ],
  },
  tree: {
    groups: [
      {
        id: 'design-system',
        title: 'Design System',
      },
      {
        id: 'common',
        title: 'Common',
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
        id: 'providers',
        title: 'Providers',
      },
      {
        id: 'misc',
        title: 'Misc',
      },
      {
        id: 'widgets',
        title: 'Widgets',
      },
      {
        id: 'physics',
        title: 'Physics',
      },
      {
        id: 'graphics',
        title: 'Graphics',
      },
      {
        id: 'gadgets',
        title: 'Gadgets',
      },
      {
        id: 'data-gui',
        title: 'Data GUI',
      },
    ],
  },
})
