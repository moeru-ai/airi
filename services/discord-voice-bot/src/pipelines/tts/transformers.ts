import type { PreTrainedModel, PreTrainedTokenizer, Processor, ProgressCallback } from '@huggingface/transformers'
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration } from '@huggingface/transformers'

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class WhisperAutomaticSpeechRecognitionPipeline {
  static model_id: string | null = null
  static tokenizer: Promise<PreTrainedTokenizer>
  static processor: Promise<Processor>
  static model: Promise<PreTrainedModel>

  static async getInstance(progress_callback?: ProgressCallback) {
    this.model_id = 'onnx-community/whisper-base'

    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.model ??= WhisperForConditionalGeneration.from_pretrained(this.model_id, {
      dtype: {
        encoder_model: 'fp32', // 'fp16' works too
        decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
      },
      device: 'auto',
      progress_callback,
    })

    return Promise.all([this.tokenizer, this.processor, this.model])
  }
}

export async function useWhisperPipeline() {
  return await WhisperAutomaticSpeechRecognitionPipeline.getInstance()
}
