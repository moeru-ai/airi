import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import { defineConfig } from 'vite'

import { Live2dSdkCache } from './scripts/live2d-sdk-cache'

export default defineConfig(({ mode }) => ({
  plugins: [Vue(), UnoCss(), Live2dSdkCache()],
  define: {
    'import.meta.env.RUNTIME_ENVIRONMENT': JSON.stringify('tauri'),
    'import.meta.env.URL_MODE': JSON.stringify(mode === 'production' ? 'file' : 'server'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', '@proj-airi/duckdb-wasm'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
