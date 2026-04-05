import * as v from 'valibot'

export const WorkerStatusSchema = v.picklist([
  'offline',
  'running',
])

export const WorkerDiagnosticsSchema = v.object({
  ok: v.boolean(),
  status: WorkerStatusSchema,
  backendKind: v.picklist(['ollama']),
  model: v.string(),
  upstreamBaseUrl: v.string(),
  fixedModel: v.optional(v.boolean()),
  error: v.optional(v.string()),
  features: v.optional(v.array(v.string())),
})

export const GatewaySessionPipelineStatsSchema = v.object({
  totalInferences: v.number(),
  autoObserveInferences: v.number(),
  userInferences: v.number(),
  skippedAutoObserve: v.number(),
  skippedNoChange: v.number(),
  timedOut: v.number(),
  avgLatencyMs: v.number(),
  lastLatencyMs: v.number(),
})

export const GatewayDiagnosticsSchema = v.object({
  activeSessions: v.number(),
  workerStatus: v.string(),
  uptimeMs: v.number(),
  livekitUrl: v.optional(v.string()),
  workerUrl: v.optional(v.string()),
  lanAddresses: v.optional(v.array(v.string())),
  preferredLanAddress: v.optional(v.string()),
  hostname: v.optional(v.string()),
  publicFrontendUrl: v.optional(v.string()),
  publicGatewayUrl: v.optional(v.string()),
  sessionPipelineStats: v.optional(v.record(v.string(), GatewaySessionPipelineStatsSchema)),
})

export type WorkerDiagnostics = v.InferOutput<typeof WorkerDiagnosticsSchema>
export type GatewayDiagnostics = v.InferOutput<typeof GatewayDiagnosticsSchema>
