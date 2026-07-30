import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'client/crossws': 'src/client/crossws/index.ts',
    'server': 'src/server/index.ts',
    'server/h3': 'src/server/h3/index.ts',
  },
  dts: true,
})
