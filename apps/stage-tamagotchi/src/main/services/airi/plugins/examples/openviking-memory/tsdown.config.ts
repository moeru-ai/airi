import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: './dist/openviking-memory',
    dts: false,
    clean: true,
    platform: 'node',
    deps: {
      alwaysBundle: [/^@proj-airi\/plugin-protocol/],
    },
  },
])
