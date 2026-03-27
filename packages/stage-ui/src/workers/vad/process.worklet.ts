// vad-worklet-processor.ts
// This file needs to be registered as an AudioWorklet

/**
 * Minimum chunk size for processing audio
 */
const MIN_CHUNK_SIZE = 512

/**
 * Global state for audio buffer accumulation
 */
class VADProcessor extends AudioWorkletProcessor {
  private globalPointer = 0
  private globalBuffer = new Float32Array(MIN_CHUNK_SIZE)

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
    const buffer = inputs[0][0]
    if (!buffer)
      return true // buffer is null when the stream ends

    if (buffer.length === 0)
      return true

    // If we have a very large buffer, process it in chunks of MIN_CHUNK_SIZE
    let sourceOffset = 0
    while (sourceOffset < buffer.length) {
      const remainingSpace = MIN_CHUNK_SIZE - this.globalPointer
      const chunkToCopy = Math.min(buffer.length - sourceOffset, remainingSpace)

      this.globalBuffer.set(buffer.subarray(sourceOffset, sourceOffset + chunkToCopy), this.globalPointer)
      this.globalPointer += chunkToCopy
      sourceOffset += chunkToCopy

      if (this.globalPointer === MIN_CHUNK_SIZE) {
        // Send a copy to avoid mutation issues in transfer
        this.port.postMessage({ buffer: new Float32Array(this.globalBuffer) })
        this.globalPointer = 0
        this.globalBuffer.fill(0)
      }
    }

    return true
  }
}

registerProcessor('vad-audio-worklet-processor', VADProcessor)
