import type {
  CodingEngineId,
  McpBackendState,
  SubagentJobInput,
  SubagentJobOutput,
  SubagentJobPhase,
  SubagentJobProvenance,
  SubagentJobRecord,
  SubagentJobStatus,
} from '@proj-airi/stage-ui/coding-workspace'
import { isV1Engine } from '@proj-airi/stage-ui/coding-workspace'

export type SubagentJobId = `job-${number}`

export interface SubagentJobStore {
  readonly jobs: Readonly<Record<SubagentJobId, SubagentJobRecord>>
  readonly nextJobOrdinal: number
  readonly tasksArtifactApproved: boolean
}

export interface CreateSubagentJobInput {
  phase: SubagentJobPhase
  taskDescription: string
  engine?: CodingEngineId
  inputs?: SubagentJobInput[]
  outputs?: SubagentJobOutput[]
  provenance?: SubagentJobProvenance[]
}

export interface SubagentJobMutation {
  store: SubagentJobStore
  jobId: SubagentJobId
  job: SubagentJobRecord
}

export interface TransitionSubagentJobOptions {
  output?: SubagentJobOutput
  provenance?: SubagentJobProvenance
}

export interface OutputProvenanceInput {
  output: SubagentJobOutput
  serverName?: string
  toolName: string
  query?: unknown
  reference?: string
  metadata?: Record<string, unknown>
}

export interface OutputWithProvenance {
  output: SubagentJobOutput
  provenance: SubagentJobProvenance
}

export type SubagentJobPolicyErrorCode =
  | 'inactive-engine'
  | 'implementation-requires-approved-tasks'
  | 'unsupported-job-phase'

export type SubagentJobLifecycleErrorCode = 'job-not-found' | 'invalid-transition' | 'job-blocked'

export class SubagentJobPolicyError extends Error {
  constructor(
    readonly code: SubagentJobPolicyErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SubagentJobPolicyError'
  }
}

export class SubagentJobLifecycleError extends Error {
  constructor(
    readonly code: SubagentJobLifecycleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SubagentJobLifecycleError'
  }
}

const POLICY_TASKS_APPROVAL_PROVENANCE = {
  source: 'agent',
  reference: 'policy:tasks-md-approval',
  metadata: {
    reason: 'implementation jobs require approved tasks.md',
  },
} as const satisfies SubagentJobProvenance

const POLICY_TASKS_PHASE_PROVENANCE = {
  source: 'agent',
  reference: 'policy:subagent-phase',
  metadata: {
    reason: 'subagent jobs may run only during requirements, design, or implementation',
  },
} as const satisfies SubagentJobProvenance

const allowedTransitions = {
  queued: ['running', 'blocked', 'cancelled'],
  running: ['blocked', 'completed', 'failed', 'cancelled'],
  blocked: ['queued', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<SubagentJobStatus, readonly SubagentJobStatus[]>

export function createSubagentJobStore(
  options: {
    jobs?: Readonly<Record<SubagentJobId, SubagentJobRecord>>
    nextJobOrdinal?: number
    tasksArtifactApproved?: boolean
  } = {},
): SubagentJobStore {
  const jobs = options.jobs ?? {}

  return {
    jobs,
    nextJobOrdinal: options.nextJobOrdinal ?? nextJobOrdinalFor(jobs),
    tasksArtifactApproved: options.tasksArtifactApproved ?? false,
  }
}

export function approveTasksArtifact(store: SubagentJobStore): SubagentJobStore {
  return {
    ...store,
    tasksArtifactApproved: true,
  }
}

export function createSubagentJob(store: SubagentJobStore, input: CreateSubagentJobInput): SubagentJobMutation {
  const engine = input.engine ?? 'native'
  assertV1JobEngine(engine)

  const status = initialStatusForJob(store, input.phase)
  const jobId = `job-${store.nextJobOrdinal}` as SubagentJobId
  const job = {
    phase: input.phase,
    taskDescription: input.taskDescription,
    engine,
    status,
    inputs: [...(input.inputs ?? [])],
    outputs: [...(input.outputs ?? [])],
    provenance: initialProvenanceForJob(store, input.phase, input.provenance ?? []),
  } satisfies SubagentJobRecord

  return withJob(store, jobId, job)
}

export function transitionSubagentJob(
  store: SubagentJobStore,
  jobId: SubagentJobId,
  status: SubagentJobStatus,
  options: TransitionSubagentJobOptions = {},
): SubagentJobMutation {
  const job = getExistingJob(store, jobId)

  assertTransitionAllowed(store, job, status)

  return withJob(store, jobId, {
    ...job,
    status,
    outputs: options.output ? [...job.outputs, options.output] : job.outputs,
    provenance: options.provenance ? [...job.provenance, options.provenance] : job.provenance,
  })
}

export function appendJobOutput(
  store: SubagentJobStore,
  jobId: SubagentJobId,
  attachment: OutputWithProvenance,
): SubagentJobMutation {
  const job = getExistingJob(store, jobId)

  return withJob(store, jobId, {
    ...job,
    outputs: [...job.outputs, attachment.output],
    provenance: [...job.provenance, attachment.provenance],
  })
}

export function attachMcpProvenanceToOutput(input: OutputProvenanceInput): OutputWithProvenance {
  return attachBackendProvenanceToOutput(input, 'mcp', 'available')
}

export function attachSerenaProvenanceToOutput(input: OutputProvenanceInput): OutputWithProvenance {
  return attachBackendProvenanceToOutput(input, 'serena', 'serena')
}

export function appendMcpOutput(
  store: SubagentJobStore,
  jobId: SubagentJobId,
  input: OutputProvenanceInput,
): SubagentJobMutation {
  return appendJobOutput(store, jobId, attachMcpProvenanceToOutput(input))
}

export function appendSerenaOutput(
  store: SubagentJobStore,
  jobId: SubagentJobId,
  input: OutputProvenanceInput,
): SubagentJobMutation {
  return appendJobOutput(store, jobId, attachSerenaProvenanceToOutput(input))
}

function assertV1JobEngine(engine: CodingEngineId): asserts engine is 'native' {
  if (!isV1Engine(engine)) {
    throw new SubagentJobPolicyError(
      'inactive-engine',
      `Subagent engine "${engine}" is reserved but inactive in v1. Use "native".`,
    )
  }
}

function initialStatusForJob(store: SubagentJobStore, phase: SubagentJobPhase): SubagentJobStatus {
  if (phase === 'requirements' || phase === 'design') {
    return 'queued'
  }

  if (phase === 'implementation') {
    return store.tasksArtifactApproved ? 'queued' : 'blocked'
  }

  return 'blocked'
}

function initialProvenanceForJob(
  store: SubagentJobStore,
  phase: SubagentJobPhase,
  provenance: SubagentJobProvenance[],
): SubagentJobProvenance[] {
  if (phase === 'implementation' && !store.tasksArtifactApproved) {
    return [...provenance, POLICY_TASKS_APPROVAL_PROVENANCE]
  }

  if (phase === 'tasks') {
    return [...provenance, POLICY_TASKS_PHASE_PROVENANCE]
  }

  return [...provenance]
}

function assertTransitionAllowed(store: SubagentJobStore, job: SubagentJobRecord, status: SubagentJobStatus): void {
  if (job.status === status) {
    return
  }

  if (job.status === 'blocked' && status === 'running') {
    throw new SubagentJobLifecycleError(
      'job-blocked',
      'Blocked subagent jobs must be returned to queued before running.',
    )
  }

  if (status === 'queued' && !canQueueJob(store, job)) {
    throw new SubagentJobLifecycleError('job-blocked', 'This subagent job is still blocked by policy.')
  }

  const nextStatuses = allowedTransitions[job.status] as readonly SubagentJobStatus[]

  if (!nextStatuses.includes(status)) {
    throw new SubagentJobLifecycleError(
      'invalid-transition',
      `Cannot transition subagent job from "${job.status}" to "${status}".`,
    )
  }
}

function canQueueJob(store: SubagentJobStore, job: SubagentJobRecord): boolean {
  if (job.engine !== 'native') {
    return false
  }

  if (job.phase === 'requirements' || job.phase === 'design') {
    return true
  }

  if (job.phase === 'implementation') {
    return store.tasksArtifactApproved
  }

  return false
}

function attachBackendProvenanceToOutput(
  input: OutputProvenanceInput,
  source: Extract<SubagentJobProvenance['source'], 'mcp' | 'serena'>,
  backend: McpBackendState,
): OutputWithProvenance {
  return {
    output: input.output,
    provenance: {
      source,
      backend,
      serverName: input.serverName,
      toolName: input.toolName,
      reference: input.reference,
      metadata: {
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.metadata ?? {}),
      },
    },
  }
}

function getExistingJob(store: SubagentJobStore, jobId: SubagentJobId): SubagentJobRecord {
  const job = store.jobs[jobId]

  if (!job) {
    throw new SubagentJobLifecycleError('job-not-found', `Subagent job "${jobId}" does not exist.`)
  }

  return job
}

function withJob(store: SubagentJobStore, jobId: SubagentJobId, job: SubagentJobRecord): SubagentJobMutation {
  const isNewJob = store.jobs[jobId] == null

  return {
    store: {
      ...store,
      jobs: {
        ...store.jobs,
        [jobId]: job,
      },
      nextJobOrdinal: isNewJob ? store.nextJobOrdinal + 1 : store.nextJobOrdinal,
    },
    jobId,
    job,
  }
}

function nextJobOrdinalFor(jobs: Readonly<Record<SubagentJobId, SubagentJobRecord>>): number {
  const largestJobOrdinal = Object.keys(jobs).reduce((largest, jobId) => {
    const match = /^job-(\d+)$/.exec(jobId)
    return match ? Math.max(largest, Number(match[1])) : largest
  }, 0)

  return largestJobOrdinal + 1
}
