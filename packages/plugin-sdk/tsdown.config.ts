import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    'src/index.ts',
    'src/plugin-host/index.ts',
    'src/plugin-host/runtimes/node/index.ts',
    'src/plugin-host/runtimes/web/index.ts',
  ],
  format: 'esm',
})
