/// <reference types="@types/audioworklet" />

import type { ConverterTypeValue } from '@alexanderolsen/libsamplerate-js/dist/converter-type'

import { ConverterType, create } from '@alexanderolsen/libsamplerate-js'

interface ProcessorOptions {
  inputSampleRate: number
  outputSampleRate: number
  channels: number
  converterType: ConverterTypeValue
  bufferSize: number // in frames
}

class ResamplingAudioWorkletProcessor extends AudioWorkletProcessor {
  private converter: Awaited<ReturnType<typeof create>> | null = null
  private isInitialized = false
  private options: ProcessorOptions
  private inputBuffer: Float32Array
  private bufferSize: number
  private bufferFill = 0 // frames currently stored

  constructor(options: AudioWorkletNodeOptions) {
    super()

    this.options = {
      inputSampleRate: options.processorOptions?.inputSampleRate || 44100,
      outputSampleRate: options.processorOptions?.outputSampleRate || 16000,
      channels: options.processorOptions?.channels || 1,
      converterType:
        options.processorOptions?.converterType
        || ConverterType.SRC_SINC_MEDIUM_QUALITY,
      bufferSize: options.processorOptions?.bufferSize || 4096,
    }

    this.bufferSize = this.options.bufferSize
    this.inputBuffer = new Float32Array(this.bufferSize * this.options.channels)

    this.initializeConverter()

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateOptions')
        this.updateOptions(event.data.options)
    }
  }

  private async initializeConverter() {
    try {
      this.converter = await create(
        this.options.channels,
        this.options.inputSampleRate,
        this.options.outputSampleRate,
        { converterType: this.options.converterType },
      )
      this.isInitialized = true
      this.port.postMessage({ type: 'initialized', success: true })
    }
    catch (error) {
      console.error('Failed to initialize sample rate converter:', error)
      this.port.postMessage({
        type: 'initialized',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async updateOptions(newOptions: Partial<ProcessorOptions>) {
    const needsReinitialize
      = newOptions.inputSampleRate !== this.options.inputSampleRate
      || newOptions.outputSampleRate !== this.options.outputSampleRate
      || newOptions.channels !== this.options.channels
      || newOptions.converterType !== this.options.converterType

    Object.assign(this.options, newOptions)

    if (needsReinitialize && this.converter) {
      this.converter.destroy()
      this.converter = null
      this.isInitialized = false
      this.inputBuffer = new Float32Array(
        this.options.bufferSize * this.options.channels,
      )
      this.bufferFill = 0
      await this.initializeConverter()
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]

    if (!this.isInitialized || !this.converter || !input.length) {
      // Pass-through if uninitialized
      for (let ch = 0; ch < output.length; ch++) {
        if (input[ch])
          output[ch].set(input[ch])
      }
      return true
    }

    try {
      const framesPerBlock = input[0]?.length ?? 0
      let offset = 0

      while (offset < framesPerBlock) {
        const spaceLeft = this.bufferSize - this.bufferFill
        const framesToCopy = Math.min(spaceLeft, framesPerBlock - offset)

        // Interleave input into buffer
        for (let f = 0; f < framesToCopy; f++) {
          for (let ch = 0; ch < this.options.channels; ch++) {
            this.inputBuffer[(this.bufferFill + f) * this.options.channels + ch]
              = input[ch]?.[offset + f] ?? 0
          }
        }

        this.bufferFill += framesToCopy
        offset += framesToCopy

        // If buffer full → resample + flush
        if (this.bufferFill >= this.bufferSize) {
          const chunk = this.inputBuffer.subarray(
            0,
            this.bufferSize * this.options.channels,
          )
          const resampledData = this.converter.simple(chunk)

          this.port.postMessage({
            type: 'audioData',
            data: resampledData,
            originalSampleRate: this.options.inputSampleRate,
            outputSampleRate: this.options.outputSampleRate,
            timestamp: currentTime,
          })

          // De-interleave for output
          for (let ch = 0; ch < this.options.channels; ch++) {
            if (output[ch]) {
              const channelData = resampledData.filter(
                (_, i) => i % this.options.channels === ch,
              )
              const copyLength = Math.min(
                channelData.length,
                output[ch].length,
              )
              output[ch].set(channelData.subarray(0, copyLength))
              if (copyLength < output[ch].length)
                output[ch].fill(0, copyLength)
            }
          }

          this.bufferFill = 0
        }
      }
    }
    catch (error) {
      console.error('Resampling error in worklet:', error)
      this.port.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })

      // Fail-safe: passthrough
      for (let ch = 0; ch < output.length; ch++) {
        if (input[ch])
          output[ch].set(input[ch])
      }
    }

    return true
  }
}

registerProcessor('resampling-processor', ResamplingAudioWorkletProcessor)
