import path from 'node:path'

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { x } from 'tinyexec'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { discoverTamagotchiScenarios, main, parseAiriScreenshotCliArguments } from './cli'

vi.mock('tinyexec', () => ({
  x: vi.fn(async () => ({
    exitCode: 0,
    stderr: '',
    stdout: '',
  })),
}))

const xMock = vi.mocked(x)

beforeEach(() => {
  xMock.mockClear()
})

describe('parseAiriScreenshotCliArguments', () => {
  it('parses a tamagotchi capture preset', () => {
    expect(parseAiriScreenshotCliArguments([
      'capture',
      'tamagotchi',
      '--scenario',
      'settings-connection',
      '--output-dir',
      '.vishot/pr-123',
    ])).toEqual({
      command: 'capture',
      target: 'tamagotchi',
      scenario: 'settings-connection',
      outputDir: '.vishot/pr-123',
      format: 'png',
    })
  })

  it('parses a tamagotchi scenario file path and output format', () => {
    expect(parseAiriScreenshotCliArguments([
      'capture',
      'tamagotchi',
      '--scenario',
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
      '--output-dir',
      '.vishot/hearing',
      '--format',
      'avif',
    ])).toEqual({
      command: 'capture',
      target: 'tamagotchi',
      scenario: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
      outputDir: '.vishot/hearing',
      format: 'avif',
    })
  })

  it('uses a target-specific default output directory', () => {
    expect(parseAiriScreenshotCliArguments([
      'capture',
      'tamagotchi',
      '--scenario',
      'settings-connection',
    ])).toEqual({
      command: 'capture',
      target: 'tamagotchi',
      scenario: 'settings-connection',
      outputDir: '.vishot/airi-screenshot/tamagotchi',
      format: 'png',
    })
  })

  it('rejects unsupported targets', () => {
    expect(() => parseAiriScreenshotCliArguments([
      'capture',
      'stage-web',
      '--route',
      '/settings/characters',
    ])).toThrow('Unsupported AIRI screenshot target "stage-web". Expected "tamagotchi".')
  })

  it('rejects missing tamagotchi scenario input', () => {
    expect(() => parseAiriScreenshotCliArguments([
      'capture',
      'tamagotchi',
    ])).toThrow('Usage: airi-screenshot capture tamagotchi --scenario <preset-or-path> [--output-dir <dir>]')
  })
})

describe('main', () => {
  it('delegates a discovered scenario id to the existing Electron runner', async () => {
    await main([
      'capture',
      'tamagotchi',
      '--scenario',
      'settings-connection',
      '--output-dir',
      '.vishot/pr-123',
    ])

    expect(xMock).toHaveBeenCalledWith(
      'pnpm',
      [
        '-F',
        '@proj-airi/vishot-runner-electron',
        'capture',
        '../scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
        '--output-dir',
        '../../.vishot/pr-123',
        '--format',
        'png',
      ],
      {
        throwOnError: false,
        nodeOptions: {
          stdio: 'inherit',
        },
      },
    )
  })

  it('delegates explicit scenario paths to the existing Electron runner', async () => {
    await main([
      'capture',
      'tamagotchi',
      '--scenario',
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
      '--output-dir',
      '.vishot/hearing',
      '--format',
      'avif',
    ])

    expect(xMock).toHaveBeenCalledWith(
      'pnpm',
      [
        '-F',
        '@proj-airi/vishot-runner-electron',
        'capture',
        '../scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
        '--output-dir',
        '../../.vishot/hearing',
        '--format',
        'avif',
      ],
      {
        throwOnError: false,
        nodeOptions: {
          stdio: 'inherit',
        },
      },
    )
  })

  it('rejects non-zero delegated runner exits', async () => {
    xMock.mockResolvedValueOnce({
      exitCode: 1,
      stderr: '',
      stdout: '',
    })

    await expect(main([
      'capture',
      'tamagotchi',
      '--scenario',
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
    ])).rejects.toThrow('AIRI screenshot command exited with code 1.')
  })
})

describe('discoverTamagotchiScenarios', () => {
  it('discovers root scenario files and folder scenarios with index entrypoints', async () => {
    const scenariosRoot = await mkdtemp(path.join(tmpdir(), 'airi-screenshot-scenarios-'))
    const folderScenarioRoot = path.join(scenariosRoot, 'demo-controls-settings-chat-websocket')

    await mkdir(folderScenarioRoot)
    await writeFile(path.join(scenariosRoot, 'settings-connection.ts'), '')
    await writeFile(path.join(scenariosRoot, 'demo-hearing-dialog.ts'), '')
    await writeFile(path.join(folderScenarioRoot, 'index.ts'), '')
    await writeFile(path.join(folderScenarioRoot, 'manifest.ts'), '')

    await expect(discoverTamagotchiScenarios({ scenariosRoot })).resolves.toEqual({
      'demo-controls-settings-chat-websocket': path.join(folderScenarioRoot, 'index.ts'),
      'demo-hearing-dialog': path.join(scenariosRoot, 'demo-hearing-dialog.ts'),
      'settings-connection': path.join(scenariosRoot, 'settings-connection.ts'),
    })
  })

  it('discovers a single root scenario file', async () => {
    const scenariosRoot = await mkdtemp(path.join(tmpdir(), 'airi-screenshot-scenarios-'))
    await writeFile(path.join(scenariosRoot, 'settings-connection.ts'), '')

    await expect(discoverTamagotchiScenarios({ scenariosRoot })).resolves.toEqual({
      'settings-connection': path.join(scenariosRoot, 'settings-connection.ts'),
    })
  })
})
