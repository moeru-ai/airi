import { fileURLToPath, URL } from 'node:url'

import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [Vue(), UnoCss(), DownloadLive2DSDK()],
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
