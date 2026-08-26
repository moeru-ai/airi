import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'audio-context/index': 'src/audio-context/index.ts',
    'audio-context/processor.worklet': 'src/audio-context/processor.worklet.ts',
    'encoding/index': 'src/encoding/index.ts',
    'index': 'src/index.ts',
  },
  external: [
    '@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worker&url',
    './processor.worklet?worker&url',
  ],
  unbundle: true,
})
