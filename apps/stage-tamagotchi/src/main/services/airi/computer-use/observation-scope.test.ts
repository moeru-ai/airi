import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { computerUsePreviewImage, computerUseReadImage, computerUseRun } from '../../../../shared/eventa/computer-use'
import { emitAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { READ_ONLY_COMMANDS } from './classifier'
import { setupComputerUse } from './index'

const external = vi.hoisted(() => ({ start: vi.fn(), execute: vi.fn() }))
vi.mock('@auv-js/sdk/node', () => ({ startAuv: external.start }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/fixture' } }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: external.execute }) }
})

let renderer: ReturnType<typeof createWindowIpc>
const attribution = { sessionId: 'session-a', turnId: 'turn-a', toolCallId: 'call-a' }

beforeEach(() => {
  vi.clearAllMocks()
  const ipc = new EventEmitter()
  setupComputerUse(createContext(ipc as never).context, { binaryPath: 'fixture-auv', storeRoot: '/fixture' })
  renderer = createWindowIpc(ipc)
  external.start.mockResolvedValue({ connectionOptions: { credential: 'fixture-token' }, endpoints: ['ipc://fixture'], exited: new Promise(() => {}), stop: vi.fn() })
  external.execute.mockImplementation(() => Object.assign(Promise.resolve({ stdout: '{}', stderr: '' }), { child: { stdin: new PassThrough() } }))
})

afterEach(async () => {
  await emitAppBeforeQuit()
  vi.restoreAllMocks()
})

// U7 made two global OCR calls and one region read. These OS mocks never access a desktop.
it.each([
  ['invoke', 'screen.findText', 'first-fixture-marker', '--json', '--detail'],
  ['invoke', 'screen.findText', 'second-fixture-marker', '--json', '--detail'],
  ['invoke', 'screen.captureRegion', '--x', '340', '--y', '440', '--width', '320', '--height', '30', '--label', 'challenge-token', '--json'],
])('u7 refuses unscoped observation %j before daemon startup', async (...argv) => {
  const error = await defineInvoke(renderer.context, computerUseRun)({ argv, attribution }).then(() => undefined, error => error)
  console.info(JSON.stringify({ argv, daemonStarts: external.start.mock.calls.length, dispatches: external.execute.mock.calls.length, error: String(error) }))
  expect(external.start).not.toHaveBeenCalled()
  expect(external.execute).not.toHaveBeenCalled()
  expect(String(error)).toContain('trusted observation scope')
})

it.each([...READ_ONLY_COMMANDS])('does not interpret a model target as a grant for %s', async (command) => {
  await expect(defineInvoke(renderer.context, computerUseRun)({ argv: ['invoke', command, '--target', 'window:123'], attribution })).rejects.toThrow('trusted observation scope')
  expect(external.start).not.toHaveBeenCalled()
  expect(external.execute).not.toHaveBeenCalled()
})

it('keeps image reads and history previews closed without trusted capture provenance', async () => {
  await expect(defineInvoke(renderer.context, computerUseReadImage)({ path: '/fixture/capture.png', attribution })).rejects.toThrow('trusted observation scope')
  await expect(defineInvoke(renderer.context, computerUsePreviewImage)({ path: '/fixture/capture.png' })).rejects.toThrow('trusted observation scope')
  expect(external.execute).not.toHaveBeenCalled()
})

it('keeps command help available without observing the desktop', async () => {
  await expect(defineInvoke(renderer.context, computerUseRun)({ argv: ['invoke', 'window.capture', '--help'] })).resolves.toMatchObject({ exitCode: 0 })
  expect(external.execute).toHaveBeenCalledOnce()
})
