import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'collector/index': 'src/collector/index.ts',
    'projections/index': 'src/projections/index.ts',
    'profiles/voice': 'src/profiles/voice.ts',
    'profiles/agent': 'src/profiles/agent.ts',
    'testing/index': 'src/testing/index.ts',
    'views/index': 'src/views/index.ts',
  },
  dts: true,
})
