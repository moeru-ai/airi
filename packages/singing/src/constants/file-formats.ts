/**
 * Supported audio file formats for pipeline input/output.
 */
export enum AudioFormat {
  WAV = 'wav',
  MP3 = 'mp3',
  FLAC = 'flac',
  OGG = 'ogg',
}

/** Default working format used between pipeline stages */
export const WORKING_FORMAT = AudioFormat.WAV

/** Default working sample rate in Hz */
export const WORKING_SAMPLE_RATE = 44100

/** Default bit depth for working audio */
export const WORKING_BIT_DEPTH = 16
