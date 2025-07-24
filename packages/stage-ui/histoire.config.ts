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
      /\.web\.story\.vue$/,
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
        id: 'misc',
        title: 'Misc',
      },
      {
        id: 'data-pane',
        title: 'Data Pane',
      },
      {
        id: 'menu',
        title: 'Menu',
      },
      {
        id: 'widgets',
        title: 'Widgets',
      },
      {
        id: 'gadgets',
        title: 'Gadgets',
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
        id: 'providers',
        title: 'Providers',
      },
    ],
  },
})
