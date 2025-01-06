import type { Buffer } from 'node:buffer'

export function pcmToWav(pcmBuffer: Buffer, sampleRate: number, numChannels: number): Uint8Array {
  const byteRate = sampleRate * numChannels * 2 // Assuming 16-bit PCM (2 bytes per sample)
  const blockAlign = numChannels * 2 // Block align for 16-bit PCM

  // Create WAV header
  const header = new ArrayBuffer(44)
  const view = new DataView(header)

  // Write RIFF identifier
  writeString(view, 0, 'RIFF')
  // Write file length (size of data + header)
  view.setUint32(4, 36 + pcmBuffer.byteLength, true)
  // Write WAVE identifier
  writeString(view, 8, 'WAVE')
  // Write format chunk identifier
  writeString(view, 12, 'fmt ')
  // Write format chunk length (16 for PCM)
  view.setUint32(16, 16, true)
  // Write audio format (1 for PCM)
  view.setUint16(20, 1, true)
  // Write number of channels
  view.setUint16(22, numChannels, true)
  // Write sample rate
  view.setUint32(24, sampleRate, true)
  // Write byte rate
  view.setUint32(28, byteRate, true)
  // Write block align
  view.setUint16(32, blockAlign, true)
  // Write bits per sample (16)
  view.setUint16(34, 16, true)
  // Write data chunk identifier
  writeString(view, 36, 'data')
  // Write data chunk length (size of PCM data)
  view.setUint32(40, pcmBuffer.byteLength, true)

  // Combine header and PCM data into one buffer
  const wavBuffer = new Uint8Array(header.byteLength + pcmBuffer.byteLength)

  wavBuffer.set(new Uint8Array(header), 0)
  wavBuffer.set(new Uint8Array(pcmBuffer), header.byteLength)

  return wavBuffer
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
