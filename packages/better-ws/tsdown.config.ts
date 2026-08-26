import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: {
    'client/crossws': 'src/client/crossws/index.ts',
    'index': 'src/index.ts',
    'server': 'src/server/index.ts',
    'server/h3': 'src/server/h3/index.ts',
  },
})
