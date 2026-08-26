import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    'src/index.ts',
    'src/main/index.ts',
  ],
  format: 'esm',
  inlineOnly: false,
})
