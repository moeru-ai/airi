import assert from 'node:assert/strict'

import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { arch, platform } from 'node:process'
import { Worker } from 'node:worker_threads'

if (platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const path = require.resolve(`../dist/darwin-${arch}/backdrop.node`)
  const native = require(path)
  assert.equal(typeof native.attach, 'function')
  assert.equal(typeof native.setRegions, 'function')
  assert.equal(typeof native.detach, 'function')
  assert.throws(() => native.attach(Buffer.alloc(1), 16), /invalid pointer size/)
  assert.throws(() => native.attach(Buffer.alloc(8), 16), /handle is null/)
  assert.throws(() => native.setRegions(999, []), /closed or disposed/)
  assert.doesNotThrow(() => native.detach(999))
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads')
    try {
      require(workerData)
      parentPort.postMessage({ rejected: false })
    }
    catch (error) {
      parentPort.postMessage({ rejected: true, message: error.message })
    }
  `, { eval: true, workerData: path })
  const message = await new Promise((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
  })
  assert.equal(message.rejected, true)
  assert.match(message.message, /main AppKit thread/)
  await worker.terminate()
  assert.doesNotThrow(() => native.detach(999))
  console.info('Native module contract smoke passed without creating a window')
}
else {
  const { NativeBackdrop } = await import('@proj-airi/electron-native-backdrop')
  assert.throws(() => new NativeBackdrop(Buffer.alloc(8)), /supports macOS only/)
  console.info('Unsupported-platform policy smoke passed without loading a native module')
}
