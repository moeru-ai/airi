import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * Persist a multipart-uploaded file to disk without buffering the entire body in RAM.
 */
export async function writeMultipartFileToDisk(
  file: { stream: () => unknown },
  destinationPath: string,
): Promise<void> {
  const input = Readable.fromWeb(file.stream() as globalThis.ReadableStream<Uint8Array>)
  const output = createWriteStream(destinationPath)

  await pipeline(input, output)
}
