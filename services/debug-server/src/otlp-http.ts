import type { Context } from 'hono'
import type { HTTPException } from 'hono/http-exception'

import type { OtlpContentType } from './protocol'

import { MIMEType } from 'node:util'

import { Code } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/code_pb.js'

import { encodeStatus } from './protocol'

const errorCodes = new Map<number, Code>([
  [400, Code.INVALID_ARGUMENT],
  [401, Code.UNAUTHENTICATED],
  [403, Code.PERMISSION_DENIED],
  [404, Code.NOT_FOUND],
  [410, Code.OUT_OF_RANGE],
  [413, Code.RESOURCE_EXHAUSTED],
  [415, Code.INVALID_ARGUMENT],
  [503, Code.UNAVAILABLE],
])

export function otlpContentType(value: string | undefined): OtlpContentType | undefined {
  if (value === undefined)
    return 'application/json'
  let essence: string
  try {
    essence = new MIMEType(value).essence.toLowerCase()
  }
  catch {
    return undefined
  }
  return essence === 'application/json' || essence === 'application/x-protobuf' ? essence : undefined
}

export function otlpErrorResponse(c: Context, error: HTTPException): Response {
  const requestType = otlpContentType(c.req.header('content-type'))
  const responseType = requestType !== undefined && (c.req.path === '/v1/traces' || c.req.path === '/v1/logs')
    ? requestType
    : 'application/json'
  const body = encodeStatus(responseType, errorCodes.get(error.status) ?? Code.INTERNAL, error.message)
  const headers = new Headers(error.res?.headers)
  headers.set('content-type', responseType)
  if (error.status === 503)
    headers.set('retry-after', '1')
  return c.body(body, { headers, status: error.status })
}
