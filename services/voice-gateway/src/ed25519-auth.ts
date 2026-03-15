import { Buffer } from 'node:buffer'
import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface DeviceIdentity {
  deviceId: string
  publicKey: string
  privateKey: string
}

export function loadDeviceIdentity(): DeviceIdentity {
  const identityPath = join(homedir(), '.openclaw', 'identity', 'device.json')
  const raw = readFileSync(identityPath, 'utf-8')
  const data = JSON.parse(raw)

  return {
    deviceId: data.deviceId,
    publicKey: data.publicKey,
    privateKey: data.privateKey,
  }
}

export function signChallenge(identity: DeviceIdentity, nonce: string, token: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const message = `v3|${identity.deviceId}|gateway-client|backend|operator|operator.admin|${timestamp}|${token}|${nonce}|darwin|`

  const privateKeyPem = identity.privateKey.includes('-----')
    ? identity.privateKey
    : `-----BEGIN PRIVATE KEY-----\n${identity.privateKey}\n-----END PRIVATE KEY-----`

  const signature = sign(
    null,
    Buffer.from(message, 'utf-8'),
    {
      key: privateKeyPem,
      format: 'pem',
      type: 'pkcs8',
    },
  )

  // Base64url encode
  return signature.toString('base64url')
}
