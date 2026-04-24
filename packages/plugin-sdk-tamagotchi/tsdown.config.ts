import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/gamelet/index.ts',
    'src/tools/index.ts',
  ],
  dts: true,
  format: 'esm',
})
