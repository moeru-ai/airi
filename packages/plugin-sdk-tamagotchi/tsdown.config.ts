import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    'src/index.ts',
    'src/widgets/index.ts',
    'src/gamelet/index.ts',
    'src/kits/gamelet/index.ts',
    'src/kits/tool/index.ts',
    'src/tools/index.ts',
  ],
  format: 'esm',
})
