import { utc } from '@date-fns/utc'
import { encodeBase64, merge } from '@moeru/std'
import { format } from 'date-fns'
import { ofetch } from 'ofetch'
import { subtle } from 'uncrypto'
import { v4 as uuidV4 } from 'uuid'

import { nlsMetaEndpointFromRegion } from './utils'

const SIGNING_METHOD = 'HMAC-SHA1'
const SIGNATURE_VERSION = '1.0'
const API_VERSION = '2019-02-28'

type AliyunQueryParams = Record<string, string>

export interface CreateTokenOptions {
  regionId?: string
  endpoint?: string
  timestamp?: Date
  signatureNonce?: string
  extraQuery?: AliyunQueryParams
}

export interface CreateTokenRequest {
  endpoint: string
  canonicalQuery: string
  stringToSign: string
  signature: string
  encodedSignature: string
  signedQuery: string
  params: AliyunQueryParams
  url: string
}

export function canonicalizeQuery(params: AliyunQueryParams): string {
  return Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
}

export function createStringToSign(
  method: string,
  path: string,
  canonicalQuery: string,
): string {
  const encodedPath = encodeURIComponent(path)
  const encodedQuery = encodeURIComponent(canonicalQuery)
  return `${method}&${encodedPath}&${encodedQuery}`
}

export async function signStringToBase64(stringToSign: string, accessKeySecret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(`${accessKeySecret}&`)
  const algorithm: HmacImportParams = {
    name: 'HMAC',
    hash: { name: 'SHA-1' },
  }
  const cryptoKey = await subtle.importKey(
    'raw',
    keyData as Uint8Array<ArrayBuffer>,
    algorithm,
    false,
    ['sign'],
  )

  const signDataEncoder = new TextEncoder()
  const data = signDataEncoder.encode(stringToSign)
  const signatureBuffer = await subtle.sign('HMAC', cryptoKey, data as Uint8Array<ArrayBuffer>)
  return encodeBase64(signatureBuffer)
}

export async function buildCreateTokenRequest(accessKeyId: string, accessKeySecret: string, options?: CreateTokenOptions): Promise<CreateTokenRequest> {
  const mergedOptions = merge({ timestamp: new Date() }, options)

  // ISO 8601 format: YYYY-MM-DDThh:mm:ssZ
  const timestamp = format(utc(mergedOptions.timestamp), 'yyyy-MM-dd\'T\'HH:mm:ssXX')
  const signatureNonce = options?.signatureNonce ?? uuidV4()

  const params: AliyunQueryParams = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: options?.regionId ?? 'cn-shanghai',
    SignatureMethod: SIGNING_METHOD,
    SignatureNonce: signatureNonce,
    SignatureVersion: SIGNATURE_VERSION,
    Timestamp: timestamp,
    Version: API_VERSION,
    ...options?.extraQuery,
  }

  const canonicalQuery = canonicalizeQuery(params)
  const stringToSign = createStringToSign('POST', '/', canonicalQuery)
  const signatureBase64 = await signStringToBase64(stringToSign, accessKeySecret)
  const encodedSignature = encodeURIComponent(signatureBase64)
  const signedQuery = `Signature=${encodedSignature}&${canonicalQuery}`
  const endpoint = (options?.endpoint ?? nlsMetaEndpointFromRegion(options?.regionId ?? 'cn-shanghai').toString()).replace(/\/$/, '')
  const url = `${endpoint}/?${signedQuery}`

  return {
    endpoint,
    canonicalQuery,
    stringToSign,
    signature: signatureBase64,
    encodedSignature,
    signedQuery,
    params: {
      Signature: signatureBase64,
      ...params,
    },
    url,
  }
}

export async function createToken(accessKeyId: string, accessKeySecret: string, options?: CreateTokenOptions): Promise<{ token: string, expiresAt: number }> {
  const request = await buildCreateTokenRequest(accessKeyId, accessKeySecret, options)
  const response = await ofetch<{
    NlsRequestId: string
    RequestId: string
    ErrMsg: string
    Token: { ExpireTime: number, Id: string, UserId: string }
  } | {
    RequestId: string
    Message: string
    Code: string
  }>(request.url, { method: 'POST' })

  if ('Token' in response && typeof response.Token === 'object' && 'Id' in response.Token) {
    return { token: response.Token.Id, expiresAt: response.Token.ExpireTime * 1000 }
  }

  throw new Error(`Failed to create token: ${JSON.stringify(response) || 'Unknown error'}`)
}
