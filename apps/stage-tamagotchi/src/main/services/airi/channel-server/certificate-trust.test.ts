import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { installLinuxCACertificate } from './certificate-trust'

describe.runIf(process.platform === 'linux')('installLinuxCACertificate on the Linux host', () => {
  it('reports that trust installation failed instead of writing an inactive user certificate', async () => {
    // ROOT CAUSE:
    //
    // A normal Linux process cannot write to `/usr/local/share/ca-certificates`.
    // AIRI catches that error and writes the CA to
    // `~/.local/share/ca-certificates`, which `update-ca-certificates` does not
    // read. The function then returns success without changing the trust store.
    //
    // The fix must return an explicit not-installed result. It must leave the
    // generated CA path available for a supported manual or privileged flow.
    const systemWriteError = new Error('EACCES: system trust store is read-only')
    const writeCertificate = vi.fn(() => {
      throw systemWriteError
    })
    const run = vi.fn()

    const result = await installLinuxCACertificate('test-ca', {
      run,
      writeCertificate,
    })

    expect(result).toEqual({
      status: 'not-installed',
      error: systemWriteError,
    })
    expect(writeCertificate).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })
})
