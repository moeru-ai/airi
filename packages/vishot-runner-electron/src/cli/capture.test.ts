import { describe, expect, it } from 'vitest'

import { parseCaptureCliArguments } from './capture'

describe('parseCaptureCliArguments', () => {
  it('accepts a scenario path with --output-dir', () => {
    expect(parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
      format: 'png',
    })
  })

  it('accepts the -o alias', () => {
    expect(parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '-o',
      './artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
      format: 'png',
    })
  })

  it('accepts --output-dir=value', () => {
    expect(parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir=./artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
      format: 'png',
    })
  })

  it('accepts an optional --format flag', () => {
    expect(parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'avif',
    ])).toEqual({
      scenarioPath: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
      format: 'avif',
    })
  })

  it('rejects missing scenario path', () => {
    expect(() => parseCaptureCliArguments([
      '--output-dir',
      './artifacts/manual-run',
    ])).toThrow('Usage: capture <scenario.ts> --output-dir <dir>')
  })

  it('rejects missing output directory', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
    ])).toThrow('Usage: capture <scenario.ts> --output-dir <dir>')
  })

  it('rejects unsupported output formats', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'webp',
    ])).toThrow('Unsupported capture format "webp". Expected "png" or "avif".')
  })

  it('rejects extra positional arguments', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts',
      '--output-dir',
      './artifacts/manual-run',
    ])).toThrow('Usage: capture <scenario.ts> --output-dir <dir>')
  })
})
