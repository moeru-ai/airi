import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/main/index.ts',
  ],
  dts: true,
  format: 'esm',
  inlineOnly: false,
})
