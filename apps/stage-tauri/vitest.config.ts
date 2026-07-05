import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import { defineConfig } from 'vitest/config'

// Unit tests should not load vite.config.ts because DownloadLive2DSDK performs
// network-backed SDK setup during config resolution.
export default defineConfig(({ mode }) => ({
  plugins: [Vue(), UnoCss()],
  define: {
    'import.meta.env.RUNTIME_ENVIRONMENT': JSON.stringify('tauri'),
    'import.meta.env.URL_MODE': JSON.stringify(mode === 'production' ? 'file' : 'server'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', '@proj-airi/duckdb-wasm'],
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
  },
}))
