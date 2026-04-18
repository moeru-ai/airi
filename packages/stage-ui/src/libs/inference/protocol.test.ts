import { describe, expect, it } from 'vitest'

import { classifyDeviceLossReason, classifyError, InferenceAbortError, isRecoverable, throwIfAborted } from './protocol'

describe('classifyError', () => {
  it('should classify OOM errors', () => {
    expect(classifyError(new Error('out of memory'))).toBe('OOM')
    expect(classifyError(new Error('GPU allocation failed'))).toBe('OOM')
  })

  it('should classify DEVICE_LOST errors', () => {
    expect(classifyError(new Error('device was lost'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('WebGPU device lost unexpectedly'))).toBe('DEVICE_LOST')
  })

  it('should classify extended DEVICE_LOST patterns', () => {
    expect(classifyError(new Error('GPU device lost'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('GPUDevice was invalidated'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('GPUDevice is invalid'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('Device destroyed by user agent'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('GPU process crashed'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('GPU process lost'))).toBe('DEVICE_LOST')
    expect(classifyError(new Error('WebGPU device is invalid'))).toBe('DEVICE_LOST')
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

  it('should mark CANCELLED as not recoverable', () => {
    expect(isRecoverable('CANCELLED')).toBe(false)
  })
})

describe('inferenceAbortError', () => {
  it('should have name "AbortError" for DOM compatibility', () => {
    const err = new InferenceAbortError()
    expect(err.name).toBe('AbortError')
  })

  it('should carry code "CANCELLED"', () => {
    const err = new InferenceAbortError()
    expect(err.code).toBe('CANCELLED')
  })

  it('should accept a custom message', () => {
    const err = new InferenceAbortError('user cancelled')
    expect(err.message).toBe('user cancelled')
  })

  it('should use a default message when none provided', () => {
    const err = new InferenceAbortError()
    expect(err.message).toBe('The operation was aborted')
  })

  it('should be instanceof Error', () => {
    expect(new InferenceAbortError()).toBeInstanceOf(Error)
  })
})

describe('throwIfAborted', () => {
  it('should be a no-op when signal is undefined', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow()
  })

  it('should be a no-op when signal is not aborted', () => {
    const controller = new AbortController()
    expect(() => throwIfAborted(controller.signal)).not.toThrow()
  })

  it('should throw when signal is already aborted', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => throwIfAborted(controller.signal)).toThrow()
  })

  it('should throw the signal\'s reason if it is an Error', () => {
    const controller = new AbortController()
    const reason = new Error('custom reason')
    controller.abort(reason)
    expect(() => throwIfAborted(controller.signal)).toThrow(reason)
  })

  it('should throw InferenceAbortError when reason is a string', () => {
    const controller = new AbortController()
    controller.abort('cancelled by string')
    try {
      throwIfAborted(controller.signal)
    }
    catch (err) {
      expect((err as Error).name).toBe('AbortError')
      expect((err as Error).message).toBe('cancelled by string')
      return
    }
    throw new Error('should have thrown')
  })
})

describe('classifyDeviceLossReason', () => {
  it('should return destroyed for GPUDeviceLostInfo-shaped object', () => {
    expect(classifyDeviceLossReason({ reason: 'destroyed', message: 'user requested' })).toBe('destroyed')
  })

  it('should return unknown for non-destroyed structured reason', () => {
    expect(classifyDeviceLossReason({ reason: 'unknown', message: 'driver reset' })).toBe('unknown')
  })

  it('should return destroyed when error message contains "destroyed"', () => {
    expect(classifyDeviceLossReason(new Error('Device destroyed by user agent'))).toBe('destroyed')
  })

  it('should return unknown for generic device-loss messages', () => {
    expect(classifyDeviceLossReason(new Error('GPU device lost'))).toBe('unknown')
    expect(classifyDeviceLossReason(new Error('WebGPU device lost unexpectedly'))).toBe('unknown')
  })

  it('should return unknown for non-device-loss inputs', () => {
    expect(classifyDeviceLossReason(new Error('out of memory'))).toBe('unknown')
    expect(classifyDeviceLossReason('random string')).toBe('unknown')
  })
})
