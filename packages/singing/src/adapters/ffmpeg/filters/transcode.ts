/**
 * FFmpeg transcode/conversion filter builders.
 */
export interface TranscodeOptions {
  sampleRate?: number
  bitDepth?: number
  channels?: number
  format?: string
}

/**
 * Build FFmpeg args for audio transcoding to working format.
 */
export function buildTranscodeArgs(
  inputPath: string,
  outputPath: string,
  options: TranscodeOptions = {},
): string[] {
  const args = ['-i', inputPath, '-vn', '-dn', '-y']
  if (options.sampleRate)
    args.push('-ar', String(options.sampleRate))
  if (options.channels)
    args.push('-ac', String(options.channels))
  if (options.bitDepth === 32)
    args.push('-acodec', 'pcm_f32le')
  else if (options.bitDepth === 16)
    args.push('-acodec', 'pcm_s16le')
  else if (options.bitDepth === 24)
    args.push('-acodec', 'pcm_s24le')
  args.push(outputPath)
  return args
}
