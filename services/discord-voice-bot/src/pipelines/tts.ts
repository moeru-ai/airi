import { pipeline, type PipelineType } from '@huggingface/transformers'

export class WhisperLargeV3Pipeline {
  static task: PipelineType = 'automatic-speech-recognition'
  static model = 'Xenova/whisper-tiny.en'
  static instance = null

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      // NOTE: Uncomment this to change the cache directory
      // env.cacheDir = './.cache';

      this.instance = await pipeline(this.task, this.model, { progress_callback })
    }

    return this.instance
  }
}
