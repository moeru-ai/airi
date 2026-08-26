import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@proj-airi/font-cjkfonts-allseto',
    '@proj-airi/font-departure-mono',
    '@proj-airi/font-xiaolai',
  ],
  sourcemap: true,
})
