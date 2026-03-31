import { describe, expect, it } from 'vitest'

import {
  getSingingElapsedSeconds,
  needsSingingEnvironmentProvisioning,
  needsSingingPythonProvisioning,
} from './singing'

describe('getSingingElapsedSeconds', () => {
  it('uses the current time while a job is still running', () => {
    expect(getSingingElapsedSeconds(1_000, 4_000, 'running', 9_000)).toBe(8)
  })

  it('freezes elapsed time at the terminal updatedAt timestamp', () => {
    expect(getSingingElapsedSeconds(1_000, 5_000, 'completed', 99_000)).toBe(4)
    expect(getSingingElapsedSeconds(1_000, 5_000, 'failed', 99_000)).toBe(4)
    expect(getSingingElapsedSeconds(1_000, 5_000, 'cancelled', 99_000)).toBe(4)
  })

  it('never returns a negative duration', () => {
    expect(getSingingElapsedSeconds(5_000, 1_000, 'completed', 99_000)).toBe(0)
  })
})

describe('needsSingingPythonProvisioning', () => {
  it('requires provisioning when the venv is missing', () => {
    expect(needsSingingPythonProvisioning({
      ffmpeg: true,
      pythonVenv: false,
      pythonPackagesInstalled: true,
    })).toBe(true)
  })

  it('requires provisioning when runtime packages are incomplete', () => {
    expect(needsSingingPythonProvisioning({
      ffmpeg: true,
      pythonVenv: true,
      pythonPackagesInstalled: false,
    })).toBe(true)
  })

  it('is ready only when the venv and packages are both present', () => {
    expect(needsSingingPythonProvisioning({
      ffmpeg: true,
      pythonVenv: true,
      pythonPackagesInstalled: true,
    })).toBe(false)
  })
})

describe('needsSingingEnvironmentProvisioning', () => {
  it('requires provisioning when ffmpeg is missing', () => {
    expect(needsSingingEnvironmentProvisioning({
      ffmpeg: false,
      pythonVenv: true,
      pythonPackagesInstalled: true,
    })).toBe(true)
  })

  it('reuses the python provisioning decision', () => {
    expect(needsSingingEnvironmentProvisioning({
      ffmpeg: true,
      pythonVenv: true,
      pythonPackagesInstalled: false,
    })).toBe(true)
  })

  it('returns ready only when ffmpeg and python runtime are complete', () => {
    expect(needsSingingEnvironmentProvisioning({
      ffmpeg: true,
      pythonVenv: true,
      pythonPackagesInstalled: true,
    })).toBe(false)
  })
})
