import * as v from 'valibot'

import { SessionContextSchema } from './session'

export const SessionAccessSchema = v.object({
  session: SessionContextSchema,
  sessionToken: v.string(),
})

export const GatewayBootstrapSchema = v.object({
  gatewayToken: v.string(),
})

export type SessionAccess = v.InferOutput<typeof SessionAccessSchema>
export type GatewayBootstrap = v.InferOutput<typeof GatewayBootstrapSchema>
