import { describe, expect, it } from 'vitest'

import { classifyError, isRecoverable } from './protocol'

describe('classifyError', () => {
  it('should classify OOM errors', () => {
    expect(classifyError(new Error('out of memory'))).toBe('OOM')
    expect(classifyError(new Error('GPU allocation failed'))).toBe('OOM')
  })

  it('should classify DEVICE_LOST errors', () => {
    expect(classifyError(new Error('device was lost'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('WebGPU device lost unexpectedly'))).toBe('DEVICE_LOST')
  })

  it('should classify TIMEOUT errors', () => {
    expect(classifyError(new Error('operation timeout after 120s'))).toBe('TIMEOUT')
  })

  it('should classify LOAD_FAILED with load phase', () => {
    expect(classifyError(new Error('some unknown error'), 'load')).toBe('LOAD_FAILED')
  })

  it('should classify INFERENCE_FAILED with inference phase', () => {
    expect(classifyError(new Error('some unknown error'), 'inference')).toBe('INFERENCE_FAILED')
  })

  it('should prioritize specific error patterns over phase hint', () => {
    // OOM during load should still be OOM, not LOAD_FAILED
    expect(classifyError(new Error('out of memory'), 'load')).toBe('OOM')
    // DEVICE_LOST during inference should still be DEVICE_LOST
    expect(classifyError(new Error('device was lost'), 'inference')).toBe('DEVICE_LOST')
    // TIMEOUT during load should still be TIMEOUT
    expect(classifyError(new Error('timeout'), 'load')).toBe('TIMEOUT')
  })

  it('should return UNKNOWN without phase hint for unrecognized errors', () => {
    expect(classifyError(new Error('something went wrong'))).toBe('UNKNOWN')
  })

  it('should handle non-Error inputs', () => {
    expect(classifyError('out of memory')).toBe('OOM')
    expect(classifyError('random string'), 'load').toBe('UNKNOWN')
    expect(classifyError(42)).toBe('UNKNOWN')
  })
})

describe('isRecoverable', () => {
  it('should mark TIMEOUT as recoverable', () => {
    expect(isRecoverable('TIMEOUT')).toBe(true)
  })

  it('should mark DEVICE_LOST as recoverable', () => {
    expect(isRecoverable('DEVICE_LOST')).toBe(true)
  })

  it('should mark OOM as not recoverable', () => {
    expect(isRecoverable('OOM')).toBe(false)
  })

  it('should mark LOAD_FAILED as not recoverable', () => {
    expect(isRecoverable('LOAD_FAILED')).toBe(false)
  })

  it('should mark INFERENCE_FAILED as not recoverable', () => {
    expect(isRecoverable('INFERENCE_FAILED')).toBe(false)
  })

  it('should mark UNKNOWN as not recoverable', () => {
    expect(isRecoverable('UNKNOWN')).toBe(false)
  })
})
