import type { generateTranscription } from '@xsai/generate-transcription'

import type { AIRIStreamTranscriptionResult } from './stream-transcription'

/** Hearing retains provider metadata while exposing generated or incremental transcript output. */
export type HearingTranscriptionResult
  = (Awaited<ReturnType<typeof generateTranscription>> & { mode: 'generate' })
    | (AIRIStreamTranscriptionResult & { mode: 'stream' })
