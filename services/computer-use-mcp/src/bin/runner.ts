import type { RunnerRequest, RunnerResponse } from '../runner/protocol'

import process from 'node:process'

import { createInterface } from 'node:readline'

import { errorMessageFrom } from '@moeru/std'

import { LinuxX11RunnerService } from '../runner/service'

const runner = new LinuxX11RunnerService()
const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

let queue = Promise.resolve()

async function writeResponse(response: RunnerResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function handleRequest(request: RunnerRequest) {
  try {
    switch (request.method) {
      case 'initialize':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.initialize(request.params as never),
        })
        return
      case 'getExecutionTarget':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.getExecutionTarget(),
        })
        return
      case 'getDisplayInfo':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.getDisplayInfo(),
        })
        return
      case 'getForegroundContext':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.getForegroundContext(),
        })
        return
      case 'getPermissionInfo':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.getPermissionInfo(),
        })
        return
      case 'takeScreenshot':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.takeScreenshot(request.params as never),
        })
        return
      case 'click':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.click(request.params as never),
        })
        return
      case 'typeText':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.typeText(request.params as never),
        })
        return
      case 'pressKeys':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.pressKeys(request.params as never),
        })
        return
      case 'scroll':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.scroll(request.params as never),
        })
        return
      case 'wait':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.wait(request.params as never),
        })
        return
      case 'openTestTarget':
        await writeResponse({
          id: request.id,
          ok: true,
          result: await runner.openTestTarget(),
        })
        return
      case 'shutdown':
        await runner.shutdown()
        await writeResponse({
          id: request.id,
          ok: true,
          result: { ok: true },
        })
        process.exit(0)
    }
  }
  catch (error) {
    await writeResponse({
      id: request.id,
      ok: false,
      error: {
        message: errorMessageFrom(error) || String(error),
      },
    })
  }
}

function enqueueRequest(request: RunnerRequest) {
  queue = queue.then(async () => {
    await handleRequest(request)
  }).catch(async (error) => {
    await writeResponse({
      id: request.id,
      ok: false,
      error: {
        message: errorMessageFrom(error) || String(error),
      },
    })
  })
}

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed)
    return

  try {
    const request = JSON.parse(trimmed) as RunnerRequest
    enqueueRequest(request)
  }
  catch (error) {
    process.stderr.write(`invalid runner request: ${errorMessageFrom(error) || String(error)}\n`)
  }
})

async function shutdown() {
  await runner.shutdown().catch(() => {})
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0))
})
process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0))
})
process.stdin.on('end', () => {
  void shutdown().finally(() => process.exit(0))
})
