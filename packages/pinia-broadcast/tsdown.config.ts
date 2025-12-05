import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: './src/index.ts',
    dts: true,
    sourcemap: true,
    tsconfig: './tsconfig.default.json',
  },
  {
    entry: './src/relay.worker.ts',
    dts: true,
    sourcemap: true,
    tsconfig: './tsconfig.worker.json',
  },
])
