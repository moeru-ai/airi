import { env } from 'node:process'

import { defineConfig } from 'tsdown'
import Raw from 'unplugin-raw/rolldown'
import Vue from 'unplugin-vue/rolldown'

export default defineConfig({
  entry: {
    'index': './src/index.ts',
    'components/form': './src/components/Form/index.ts',
    'components/animations': './src/components/Animations/index.ts',
  },
  define: {
    'import.meta.DEV': JSON.stringify(!!env.DEV),
  },
  exports: {
    devExports: true,
    all: true,
  },
  fixedExtension: true,
  plugins: [
    Vue(),
    Raw({
      transform: {
        options: { minifyWhitespace: true },
      },
    }),
  ],
})
