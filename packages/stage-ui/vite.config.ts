import type { Plugin } from 'vite'

import { join, resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Yaml from 'unplugin-yaml/vite'
import Inspect from 'vite-plugin-inspect'

import { defineConfig } from 'vite'

// For Histoire
export default defineConfig({
  resolve: {
    alias: {
      '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
    },
  },
  server: {
    fs: {
      allow: [join('..', '..')],
    },
  },
  plugins: [
    // TODO: Type wrong for `unplugin-yaml` in Histoire required
    // Vite version, wait until Histoire updates to support Vite 7
    Yaml() as Plugin,
    Vue(),
    Unocss(),
    // TODO: Type wrong for `unplugin-yaml` in Histoire required
    // Vite version, wait until Histoire updates to support Vite 7
    Inspect() as Plugin,
  ],
})
