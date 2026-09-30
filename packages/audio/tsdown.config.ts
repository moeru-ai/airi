import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'browser/index': 'src/browser/index.ts',
    'browser/capture.worklet': 'src/browser/capture.worklet.ts',
    'audio-context/index': 'src/audio-context/index.ts',
    'audio-context/processor.worklet': 'src/audio-context/processor.worklet.ts',
    'encoding/index': 'src/encoding/index.ts',
  },
  unbundle: true,
  external: [
    '@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worker&url',
    './processor.worklet?worker&url',
    './capture.worklet?worker&url',
  ],
})
