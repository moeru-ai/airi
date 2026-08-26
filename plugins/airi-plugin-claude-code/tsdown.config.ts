import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    dts: true,
    entry: ['./src/run.ts'],
    inlineOnly: [],
    platform: 'node',
    publint: true,
    unused: true,
  },
])
