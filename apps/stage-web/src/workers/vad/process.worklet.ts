// vad-worklet-processor.ts
// This file needs to be registered as an AudioWorklet

/**
 * Minimum chunk size for processing audio
 */
const MIN_CHUNK_SIZE = 512

/**
 * Global state for audio buffer accumulation
 */
let globalPointer = 0
const globalBuffer = new Float32Array(MIN_CHUNK_SIZE)

/**
 * VAD AudioWorklet Processor - processes audio chunks and sends them to the main thread
 */
class VADProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
    const buffer = inputs[0][0]
    if (!buffer)
      return true // buffer is null when the stream ends

    if (buffer.length > MIN_CHUNK_SIZE) {
      // If the buffer is larger than the minimum chunk size, send the entire buffer
      this.port.postMessage({ buffer })
    }
    else {
      const remaining = MIN_CHUNK_SIZE - globalPointer
      if (buffer.length >= remaining) {
        // If the buffer is larger than (or equal to) the remaining space in the global buffer, copy the remaining space
        globalBuffer.set(buffer.subarray(0, remaining), globalPointer)

        // Send the global buffer
        this.port.postMessage({ buffer: globalBuffer })

        // Reset the global buffer and set the remaining buffer
        globalBuffer.fill(0)
        globalBuffer.set(buffer.subarray(remaining), 0)
        globalPointer = buffer.length - remaining
      }
      else {
        // If the buffer is smaller than the remaining space in the global buffer, copy the buffer to the global buffer
        globalBuffer.set(buffer, globalPointer)
        globalPointer += buffer.length
      }
    }

    return true
  }
}

registerProcessor('vad-processor', VADProcessor)
