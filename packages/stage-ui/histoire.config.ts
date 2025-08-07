import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  routerMode: 'hash',
  theme: {
    title: 'AIRI UI',
    logo: {
      dark: './public/logo.svg',
      light: './public/logo.svg',
    },
    colors: {
      primary: {
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#121212',
        800: '#0a0a0a',
        900: '#020202',
      },
      gray: {
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#121212',
        750: '#0e0e0e',
        800: '#0a0a0a',
        850: '#060606',
        900: '#020202',
        950: '#000000',
      },
    },
  },
  backgroundPresets: [
    {
      label: 'Transparent',
      color: 'transparent',
      contrastColor: '#333',
    },
    {
      label: 'White',
      color: '#fff',
      contrastColor: '#333',
    },
    {
      label: 'Light gray',
      color: '#aaa',
      contrastColor: '#eee',
    },
    {
      label: 'Dark gray',
      color: '#333',
      contrastColor: '#ccc',
    },
    {
      label: 'Black',
      color: '#121212',
      contrastColor: '#fff',
    },
  ],
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
