import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/extension.ts'],
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
    sourcemap: true,
    clean: true,
    dts: false,
  },
])
