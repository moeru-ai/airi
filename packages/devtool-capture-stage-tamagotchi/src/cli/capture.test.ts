import { describe, expect, it } from 'vitest'

import { parseCaptureCliArguments } from './capture'

describe('parseCaptureCliArguments', () => {
  it('accepts a scenario path with --output-dir', () => {
    expect(parseCaptureCliArguments([
      'src/scenarios/settings-connection.ts',
      '--output-dir',
      './artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
    })
  })

  it('accepts the -o alias', () => {
    expect(parseCaptureCliArguments([
      'src/scenarios/settings-connection.ts',
      '-o',
      './artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
    })
  })

  it('accepts --output-dir=value', () => {
    expect(parseCaptureCliArguments([
      'src/scenarios/settings-connection.ts',
      '--output-dir=./artifacts/manual-run',
    ])).toEqual({
      scenarioPath: 'src/scenarios/settings-connection.ts',
      outputDir: './artifacts/manual-run',
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
      'src/scenarios/settings-connection.ts',
    ])).toThrow('Usage: capture <scenario.ts> --output-dir <dir>')
  })

  it('rejects extra positional arguments', () => {
    expect(() => parseCaptureCliArguments([
      'src/scenarios/settings-connection.ts',
      'src/scenarios/demo-hearing-dialog.ts',
      '--output-dir',
      './artifacts/manual-run',
    ])).toThrow('Usage: capture <scenario.ts> --output-dir <dir>')
  })
})
