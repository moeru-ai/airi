import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    dts: true,
    entry: ['./src/index.ts'],
    publint: true,
    unused: true,
  },
])
