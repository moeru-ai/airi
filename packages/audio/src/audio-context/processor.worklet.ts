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
  private bufferSize: number

  constructor(options: AudioWorkletNodeOptions) {
    super()

    this.options = {
      inputSampleRate: options.processorOptions?.inputSampleRate || 44100,
      outputSampleRate: options.processorOptions?.outputSampleRate || 16000,
      channels: options.processorOptions?.channels || 1,
      converterType:
        options.processorOptions?.converterType ||
        ConverterType.SRC_SINC_MEDIUM_QUALITY,
      bufferSize: options.processorOptions?.bufferSize || 4096,
    }

    this.bufferSize = this.options.bufferSize

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
    const needsReinitialize =
      (newOptions.inputSampleRate &&
        newOptions.inputSampleRate !== this.options.inputSampleRate) ||
      (newOptions.outputSampleRate &&
        newOptions.outputSampleRate !== this.options.outputSampleRate) ||
      (newOptions.channels &&
        newOptions.channels !== this.options.channels) ||
      (newOptions.converterType &&
        newOptions.converterType !== this.options.converterType)

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
        else {
          output[channel].fill(0)
        }
      }
      return true
    }

    try {
      for (
        let channel = 0;
        channel < Math.min(input.length, this.options.channels);
        channel++
      ) {
        const inputData = input[channel]

        if (inputData && inputData.length > 0) {
          // Resample
          const resampledData = this.converter.simple(inputData)

          // Send to main thread (transfer buffer to avoid GC pressure)
          this.port.postMessage(
            {
              type: 'audioData',
              channel,
              data: resampledData.buffer,
              originalSampleRate: this.options.inputSampleRate,
              outputSampleRate: this.options.outputSampleRate,
              timestamp: currentTime,
            },
            [resampledData.buffer],
          )

          // Copy to output (truncate or pad as needed)
          if (output[channel]) {
            const copyLength = Math.min(
              resampledData.length,
              output[channel].length,
            )
            output[channel].set(resampledData.subarray(0, copyLength))
            if (copyLength < output[channel].length) {
              output[channel].fill(0, copyLength)
            }
          }
        }
        else if (output[channel]) {
          output[channel].fill(0)
        }
      }
    }
    catch (error) {
      console.error('Resampling error in worklet:', error)

      this.port.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      })

      // Fallback: passthrough
      for (let channel = 0; channel < output.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel])
        }
        else {
          output[channel].fill(0)
        }
      }
    }

    return true
  }
}

registerProcessor(
  'resampling-processor',
  ResamplingAudioWorkletProcessor,
)
