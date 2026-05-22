import type { Plugin } from 'vite'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

/** Stockfish worker glue + its WASM binary, shipped verbatim under `engine/`. */
const ENGINE_FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'] as const
/** Absolute path of the `stockfish` package's prebuilt-binary directory. */
const engineBinDir = join(dirname(createRequire(import.meta.url).resolve('stockfish')), 'bin')

/**
 * Ships the Stockfish engine as verbatim, unhashed assets under `engine/`.
 *
 * The engine `.js` derives its `.wasm` URL from its own script URL, so the two
 * files must keep matching basenames and stay co-located — which rules out
 * Vite's content-hashing asset pipeline. This plugin copies them straight from
 * the `stockfish` package: emitting them at build time and serving them from a
 * dev-server middleware at the same `engine/` route.
 */
function stockfishEngineAssets(): Plugin {
  return {
    name: 'chess-stockfish-engine-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = ENGINE_FILES.find(name => req.url?.endsWith(`/engine/${name}`))
        if (!file) {
          next()
          return
        }
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(join(engineBinDir, file)))
      })
    },
    generateBundle() {
      for (const file of ENGINE_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `engine/${file}`,
          source: readFileSync(join(engineBinDir, file)),
        })
      }
    },
  }
}

/**
 * Build config for the chess gamelet UI — a standalone Vue app that the AIRI
 * host serves over an internal static-asset route and embeds in a sandboxed
 * iframe.
 *
 * `base: './'` keeps every emitted asset URL relative so the bundle resolves
 * under whatever route prefix the host mounts it on. The output is written to
 * the plugin's `ui/` directory, which is the `entrypoint` registered through
 * `defineGamelet`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [vue(), UnoCSS(), stockfishEngineAssets()],
  build: {
    outDir: fileURLToPath(new URL('../../ui', import.meta.url)),
    emptyOutDir: true,
  },
})
