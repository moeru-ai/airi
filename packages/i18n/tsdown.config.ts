import Yaml from 'unplugin-yaml/rolldown'

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'locales/index': 'src/locales/index.ts',
    'locales/en/index': 'src/locales/en/index.ts',
    'locales/zh-Hans/index': 'src/locales/zh-Hans/index.ts',
  },
  copy: [
    { from: 'src/locales', to: 'dist/locales' },
  ],
  unbundle: true,
  fixedExtension: true,
  plugins: [
    Yaml(),
  ],
})
