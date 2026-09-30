import type { SherpawModelArtifacts } from '@proj-airi/provider-inference/sherpaw-transcription/models'

/** The pinned KWS preload pack also identifies the vocabulary stored on character cards. */
export const KWS_MODEL = {
  id: 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20',
  repository: 'moeru-ai/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20',
  revision: '1770a4b22db32184c110ac43c601db17cc9c93f8',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModelArtifacts

export const KWS_MODEL_ID = KWS_MODEL.id
