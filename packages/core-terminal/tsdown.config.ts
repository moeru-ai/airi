import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/runtime-entrypoint.ts'],
  dts: true,
  format: 'esm',
})
