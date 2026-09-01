import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/widgets/index.ts',
  ],
  dts: true,
  format: 'esm',
})
