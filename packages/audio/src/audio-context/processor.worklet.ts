/// <reference types="@types/audioworklet" />

import type { ConverterTypeValue } from '@alexanderolsen/libsamplerate-js/dist/converter-type'

import { ConverterType, create } from '@alexanderolsen/libsamplerate-js'

interface ProcessorOptions {
  inputSampleRate: number
  outputSampleRate: number
  channels: number
  converterType: ConverterTypeValue
  bufferSize: number
}

class ResamplingAudioWorkletProcessor extends AudioWorkletProcessor {
  private converter: Awaited<ReturnType<typeof create>> | null = null
  private isInitialized = false
  private options: ProcessorOptions
  private inputBuffer: Float32Array[] = []
  private outputBuffer: Float32Array[] = []
  private bufferSize: number

  constructor(options: AudioWorkletNodeOptions) {
    super()

    this.options = {
      inputSampleRate: options.processorOptions?.inputSampleRate || 44100,
      outputSampleRate: options.processorOptions?.outputSampleRate || 16000,
      channels: options.processorOptions?.channels || 1,
      converterType: options.processorOptions?.converterType || ConverterType.SRC_SINC_MEDIUM_QUALITY,
      bufferSize: options.processorOptions?.bufferSize || 4096,
    }

    this.bufferSize = this.options.bufferSize

    // Initialize input/output buffers for each channel
    for (let i = 0; i < this.options.channels; i++) {
      this.inputBuffer[i] = new Float32Array(this.bufferSize)
      this.outputBuffer[i] = new Float32Array(0)
    }

    this.initializeConverter()

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateOptions') {
        this.updateOptions(event.data.options)
      }
    }
  }

  private async initializeConverter() {
    try {
      this.converter = await create(
        this.options.channels,
        this.options.inputSampleRate,
        this.options.outputSampleRate,
        {
          converterType: this.options.converterType,
        },
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
      await this.initializeConverter()
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]

    if (!this.isInitialized || !this.converter || !input.length) {
      // Pass through if not ready
      for (let channel = 0; channel < output.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel])
        }
      }
      return true
    }

    try {
      // Process each channel
      for (let channel = 0; channel < Math.min(input.length, this.options.channels); channel++) {
        const inputData = input[channel]

        if (inputData && inputData.length > 0) {
          // Resample the input data
          const resampledData = this.converter.simple(inputData)

          // Send resampled data to main thread
          this.port.postMessage({
            type: 'audioData',
            channel,
            data: resampledData,
            originalSampleRate: this.options.inputSampleRate,
            outputSampleRate: this.options.outputSampleRate,
            timestamp: currentTime,
          })

          // Copy to output (you might want to buffer this properly for different sample rates)
          if (output[channel]) {
            const copyLength = Math.min(resampledData.length, output[channel].length)
            for (let i = 0; i < copyLength; i++) {
              output[channel][i] = resampledData[i]
            }
            // Zero-pad remaining
            for (let i = copyLength; i < output[channel].length; i++) {
              output[channel][i] = 0
            }
          }
        }
      }
    }
    catch (error) {
      console.error('Resampling error in worklet:', error)

      this.port.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })

      // Pass through original data on error
      for (let channel = 0; channel < output.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel])
        }
      }
    }

    return true
  }
}

registerProcessor('resampling-processor', ResamplingAudioWorkletProcessor)
