import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/contracts/index.ts',
    'src/pipeline/index.ts',
    'src/presets/index.ts',
    'src/types/index.ts',
  ],
  dts: true,
})
