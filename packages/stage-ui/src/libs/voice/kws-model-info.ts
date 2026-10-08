import type { SherpawModelArtifacts } from '@proj-airi/provider-inference/sherpaw-transcription/models'

/**
 * The pinned bilingual Chinese and English Zipformer 3M keyword spotting pack.
 *
 * Wake word pronunciations on character cards store this pack's ID as `modelId`. Application Vite configs import
 * this value to choose remote or bundled assets, so this module must stay free of browser runtime imports.
 */
export const kwsModel = {
  id: 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20',
  repository: 'moeru-ai/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20',
  revision: '1770a4b22db32184c110ac43c601db17cc9c93f8',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModelArtifacts
