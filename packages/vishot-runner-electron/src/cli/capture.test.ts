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
      avif: {
        maxWidth: 1920,
        quality: 50,
        speed: 6,
      },
    })
  })

  it('accepts optional AVIF tuning flags', () => {
    expect(parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'avif',
      '--avif-max-width',
      '1200',
      '--avif-quality',
      '35',
      '--avif-speed',
      '4',
    ])).toEqual({
      scenarioPath: 'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
      format: 'avif',
      avif: {
        maxWidth: 1200,
        quality: 35,
        speed: 4,
      },
    })
  })

  it('applies default AVIF settings when format is avif', () => {
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
      avif: {
        maxWidth: 1920,
        quality: 50,
        speed: 6,
      },
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

  it('rejects invalid AVIF quality values', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'avif',
      '--avif-quality',
      '200',
    ])).toThrow('Unsupported AVIF quality "200". Expected an integer between 0 and 100.')
  })

  it('rejects invalid AVIF speed values', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'avif',
      '--avif-speed',
      '0',
    ])).toThrow('Unsupported AVIF speed "0". Expected an integer between 1 and 10.')
  })

  it('rejects invalid AVIF max width values', () => {
    expect(() => parseCaptureCliArguments([
      'packages/scenarios-stage-tamagotchi-electron/src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
      '--format',
      'avif',
      '--avif-max-width',
      '0',
    ])).toThrow('Unsupported AVIF max width "0". Expected an integer >= 1.')
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
