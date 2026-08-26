import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry: ['./src/extension.ts'],
    external: ['vscode'],
    format: 'cjs',
    inlineOnly: false,
    platform: 'node',
    sourcemap: true,
  },
])
