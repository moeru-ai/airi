import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The webview-ui lives in the code submodule — we reference it directly
// so the standalone app always builds against the latest webview-ui source.
const webviewRoot = path.resolve(__dirname, '../../modules/code/webview-ui')

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '18' }]],
      },
    }),
    tailwindcss(),
  ],
  // Vite root must contain ALL files that use Tailwind classes so that
  // @tailwindcss/vite can scan them for utility usage. The webview-ui
  // source uses the bulk of our Tailwind utilities and lives outside
  // src/renderer/, so we set root to the package root.
  root: __dirname,
  resolve: {
    alias: {
      // Point @roo to the code submodule's shared types
      '@roo': path.resolve(__dirname, '../../modules/code/src/shared'),
      '@': path.resolve(webviewRoot, 'src'),
      '@src': path.resolve(webviewRoot, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    reportCompressedSize: false,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: 'src/renderer/index.html',
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/chunk-[hash].js`,
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || ''
          if (name.endsWith('.css')) return 'assets/index.css'
          if (name.endsWith('.woff2') || name.endsWith('.woff') || name.endsWith('.ttf')) {
            return `assets/fonts/[name][extname]`
          }
          if (name.endsWith('.map')) return `assets/[name]`
          return `assets/[name][extname]`
        },
      },
    },
  },
  server: {
    // Dev: proxy API + WS to the backend server
    proxy: {
      '/api': 'http://127.0.0.1:3210',
      '/ws': {
        target: 'ws://127.0.0.1:3210',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['vscode-oniguruma', 'shiki'],
  },
})
