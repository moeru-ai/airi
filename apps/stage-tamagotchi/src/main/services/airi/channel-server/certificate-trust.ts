import type { writeFileSync } from 'node:fs'

import type { x } from 'tinyexec'

import { join } from 'node:path'

export interface LinuxCertificateTrustDependencies {
  /** Runs the distribution certificate command. */
  run: typeof x
  /** Writes the certificate to a trust directory. */
  writeCertificate: typeof writeFileSync
}

/** Result of an attempt to install the AIRI CA in the Linux system trust store. */
export type LinuxCertificateTrustResult
  = | {
    /** The system trust store contains the AIRI CA. */
    status: 'installed'
  }
  | {
    /** The system trust store did not accept the AIRI CA. */
    status: 'not-installed'
    /** The filesystem or distribution command error that stopped installation. */
    error: unknown
  }

/**
 * Installs the server-channel CA in the Linux system trust store.
 *
 * The function does not write to a user certificate directory because
 * `update-ca-certificates` does not read that directory.
 */
export async function installLinuxCACertificate(
  caCert: string,
  dependencies: LinuxCertificateTrustDependencies,
): Promise<LinuxCertificateTrustResult> {
  const caFileName = 'airi-websocket-ca.crt'

  try {
    dependencies.writeCertificate(join('/usr', 'local', 'share', 'ca-certificates', caFileName), caCert)
    await dependencies.run('update-ca-certificates', [], { nodeOptions: { stdio: 'ignore' } })
    return { status: 'installed' }
  }
  catch (error) {
    return { status: 'not-installed', error }
  }
}
