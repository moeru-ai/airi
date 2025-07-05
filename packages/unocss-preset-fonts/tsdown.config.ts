import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@proj-airi/font-cjkfonts-allseto',
    '@proj-airi/font-departure-mono',
    '@proj-airi/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
  fixedExtension: true,
})
