import type { Buffer } from 'node:buffer'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fromBuffer } from 'yauzl'
import { noError, onError } from './errors'

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
    let pendingWrites = 0
    let isReadingComplete = false

    function tryResolve() {
      if (isReadingComplete && pendingWrites === 0) {
        resolve()
      }
    }

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
          mkdirSync(join(target, entry.fileName), { recursive: true })
          zipFile.readEntry()

          return
        }

        // Files
        const dir = dirname(join(target, entry.fileName))
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }

        // Write the file to disk.
        pendingWrites++
        zipFile.openReadStream(entry, noError(reject, (readStream) => {
          const file = createWriteStream(join(target, entry.fileName))
          readStream.pipe(file)

          // Handle errors
          file.on('error', (err) => {
            pendingWrites--
            zipFile.close()
            reject(err)
          })

          // Wait until the file is finished writing, then read the next entry.
          file.on('finish', () => {
            file.close(() => {
              pendingWrites--
              tryResolve()
              zipFile.readEntry()
            })
          })
        }))
      })

      zipFile.on('error', onError(reject, zipFile.close))
      zipFile.on('end', noError(reject, () => {
        isReadingComplete = true
        tryResolve()
      }))
    }))
  })
}
