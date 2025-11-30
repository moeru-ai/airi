import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/relay.worker.ts',
  ],
  dts: true,
  sourcemap: true,
})
