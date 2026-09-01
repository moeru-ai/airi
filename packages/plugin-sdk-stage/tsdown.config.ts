import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/gamelet/index.ts',
    'src/gamelet/controller.ts',
    'src/kits/gamelet/index.ts',
    'src/kits/tool/index.ts',
    'src/tools/index.ts',
    'src/host/index.ts',
  ],
  dts: true,
  format: 'esm',
})
