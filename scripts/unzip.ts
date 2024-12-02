import type { Buffer } from 'node:buffer'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fromBuffer } from 'yauzl'
import { noError, onError, resolveWhenNoError } from './errors'

/**
 * Example:
 *
 * await unzip("./tim.zip", "./");
 *
 * Will create directories:
 *
 * ./tim.zip
 * ./tim
 *
 * Originally by [How to unzip to a folder using yauzl? - Stack Overflow](https://stackoverflow.com/questions/63932027/how-to-unzip-to-a-folder-using-yauzl)
 *
 * @param buffer Buffer of the zip file.
 * @param target Path to the folder where the zip folder will be put.
 */
export async function unzip(buffer: Buffer, target: string) {
  return new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, noError(reject, (zipFile) => {
      // This is the key. We start by reading the first entry.
      zipFile.readEntry()

      // Now for every entry, we will write a file or dir
      // to disk. Then call zipFile.readEntry() again to
      // trigger the next cycle.
      zipFile.on('entry', (entry) => {
      // Directories
        if (/\/$/.test(entry.fileName)) {
        // Create the directory then read the next entry.
          mkdirSync(join(target, entry.fileName))
          zipFile.readEntry()

          return
        }

        // Files

        // Write the file to disk.
        zipFile.openReadStream(entry, noError(reject, (readStream) => {
          const file = createWriteStream(join(target, entry.fileName))
          readStream.pipe(file)

          // Handle errors
          file.on('error', onError(reject, zipFile.close))
          // Wait until the file is finished writing, then read the next entry.
          file.on('finish', () => file.close(() => { zipFile.readEntry() }))
        }))
      })

      zipFile.on('error', onError(reject, zipFile.close))
      zipFile.on('end', resolveWhenNoError(reject, resolve))
    }))
  })
}
