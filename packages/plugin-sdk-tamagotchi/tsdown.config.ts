import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/widgets/index.ts',
    'src/gamelet/index.ts',
    'src/kits/gamelet/index.ts',
    'src/kits/tool/index.ts',
    'src/tools/index.ts',
  ],
  dts: true,
  format: 'esm',
})
