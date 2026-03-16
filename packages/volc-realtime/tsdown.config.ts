import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    protocol: 'src/protocol.ts',
    client: 'src/client.ts',
    events: 'src/events.ts',
    types: 'src/types.ts',
  },
  unbundle: true,
})
