/**
 * Cognition Layer Tests
 *
 * Tests for:
 * - Branded ID types
 * - Proposal creation and conversion
 * - PlanValidator (capabilities, workspaces, dependencies, cycles)
 * - MockCognitionProvider (fixtures, defaults, cancellation)
 * - CognitionCoordinator (full pipeline, rejection, events)
 * - Proposal normalization
 * - Persistence integration (snapshots)
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  createProposalId,
  createReasoningId,
  createCognitionSessionId,
  createProposal,
  proposalToPlan,
  summarizeProposal,
  extractCapabilityRequirements,
  extractWorkspaceRequirements,
} from '../cognition/index.js'
import type { CognitionContext, CognitionRequest, ProposedStep } from '../cognition/types.js'
import { PlanValidator } from '../cognition/validator.js'
import { MockCognitionProvider } from '../cognition/providers/mock-provider.js'
import { CognitionCoordinator } from '../cognition/coordinator.js'
import { CapabilityRegistry } from '../capabilities/registry.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { CancellationTokenSource } from '../tasks/cancellation.js'
import type { CapabilityId } from '../capabilities/types.js'
import { createCapabilityId, createToolId } from '../capabilities/types.js'
import type { WorkspaceId } from '../workspace/types.js'
import { createWorkspaceId } from '../workspace/types.js'
import { EventBus } from '../events/bus.js'
import { createLogger } from '../logger.js'
import { InMemoryEventStore, InMemorySnapshotStore, SnapshotManager } from '../persistence/index.js'
import type { SerializedProposal, SerializedReasoningTrace } from '../persistence/types.js'
import type { AiriEvent } from '../events/types.js'

const events = new EventBus()
const logger = createLogger('test')

// ── Helpers ──────────────────────────────────────────────────────────────

function createTestCapabilityId(name: string): CapabilityId {
  return createCapabilityId(name)
}

function createTestWorkspaceId(name: string): WorkspaceId {
  return createWorkspaceId(name)
}

function createTestProposedStep(
  overrides: Partial<ProposedStep> & { id: string; name: string; action: string },
): ProposedStep {
  return {
    input: {},
    ...overrides,
  }
}

// ── Branded ID Tests ────────────────────────────────────────────────────

describe('Branded IDs', () => {
  it('creates ProposalId from raw string', () => {
    const id = createProposalId('test-proposal')
    expect(id).toBe('test-proposal')
    expect(typeof id).toBe('string')
  })

  it('creates ReasoningId from raw string', () => {
    const id = createReasoningId('test-reasoning')
    expect(id).toBe('test-reasoning')
    expect(typeof id).toBe('string')
  })

  it('creates CognitionSessionId from raw string', () => {
    const id = createCognitionSessionId('test-session')
    expect(id).toBe('test-session')
    expect(typeof id).toBe('string')
  })
})

// ── Proposal Creation Tests ──────────────────────────────────────────────

describe('createProposal', () => {
  it('creates a proposal with required fields', () => {
    const steps = [createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' })]
    const proposal = createProposal(createReasoningId('r1'), 'Test Plan', steps)

    expect(proposal.name).toBe('Test Plan')
    expect(proposal.steps).toHaveLength(1)
    expect(proposal.id).toContain('prop-')
    expect(proposal.requestId).toBe('r1')
    expect(proposal.capabilityRequirements).toEqual([])
    expect(proposal.workspaceRequirements).toEqual([])
    expect(proposal.createdAt).toBeTruthy()
  })

  it('extracts capability requirements from steps', () => {
    const cap1 = createTestCapabilityId('code')
    const steps = [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file', capabilityRequirement: cap1 }),
    ]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps)

    expect(proposal.capabilityRequirements).toContain(cap1)
  })

  it('uses explicit capability requirements when provided', () => {
    const cap1 = createTestCapabilityId('code')
    const cap2 = createTestCapabilityId('terminal')
    const steps = [createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' })]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps, {
      capabilityRequirements: [cap1, cap2],
    })

    expect(proposal.capabilityRequirements).toEqual([cap1, cap2])
  })

  it('includes estimated execution metadata', () => {
    const steps = [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
      createTestProposedStep({ id: 's2', name: 'Step 2', action: 'write_file' }),
    ]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps)

    expect(proposal.estimatedExecution).toBeDefined()
    expect(proposal.estimatedExecution!.estimatedStepCount).toBe(2)
  })
})

// ── proposalToPlan Tests ─────────────────────────────────────────────────

describe('proposalToPlan', () => {
  it('converts a proposal to a Plan with correct step mapping', () => {
    const steps = [
      createTestProposedStep({ id: 's1', name: 'Scan', action: 'read_file' }),
      createTestProposedStep({ id: 's2', name: 'Analyze', action: 'analyze', dependencyIds: ['s1'] }),
    ]
    const proposal = createProposal(createReasoningId('r1'), 'Scan & Analyze', steps)
    const plan = proposalToPlan(proposal, { sessionId: 'session-1' })

    expect(plan.name).toBe('Scan & Analyze')
    expect(plan.steps).toHaveLength(2)
    expect(plan.status).toBe('draft')
    expect(plan.sessionId).toBe('session-1')
    expect(plan.metadata!.proposalId).toBe(proposal.id as string)
  })

  it('replaces temporary step IDs with proper StepIds', () => {
    const steps = [createTestProposedStep({ id: 'temp-1', name: 'Step 1', action: 'read_file' })]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps)
    const plan = proposalToPlan(proposal)

    // Step IDs should be branded (contain "step-").
    expect(plan.steps[0]!.id).toContain('step-')
  })

  it('resolves dependency references', () => {
    const steps = [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
      createTestProposedStep({ id: 's2', name: 'Step 2', action: 'analyze', dependencyIds: ['s1'] }),
    ]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps)
    const plan = proposalToPlan(proposal)

    // Step 2 should depend on Step 1's new StepId.
    const step1Id = plan.steps[0]!.id
    const step2Deps = plan.steps[1]!.dependencyIds!
    expect(step2Deps).toContain(step1Id)
  })

  it('preserves metadata from proposal', () => {
    const steps = [createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' })]
    const proposal = createProposal(createReasoningId('r1'), 'Test', steps, {
      confidence: 0.85,
      description: 'A test plan',
    })
    const plan = proposalToPlan(proposal)

    expect(plan.description).toBe('A test plan')
    expect(plan.metadata!.confidence).toBe(0.85)
  })
})

// ── summarizeProposal Tests ──────────────────────────────────────────────

describe('summarizeProposal', () => {
  it('creates a summary from a proposal', () => {
    const proposal = createProposal(createReasoningId('r1'), 'Test Plan', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
    ])

    const summary = summarizeProposal(proposal)

    expect(summary.planId).toBe(proposal.id)
    expect(summary.name).toBe('Test Plan')
    expect(summary.status).toBe('proposed')
    expect(summary.stepCount).toBe(1)
  })
})

// ── extractCapabilityRequirements Tests ──────────────────────────────────

describe('extractCapabilityRequirements', () => {
  it('extracts unique capabilities from steps', () => {
    const cap1 = createTestCapabilityId('code')
    const cap2 = createTestCapabilityId('terminal')
    const steps = [
      createTestProposedStep({ id: 's1', name: 'S1', action: 'read_file', capabilityRequirement: cap1 }),
      createTestProposedStep({ id: 's2', name: 'S2', action: 'bash', capabilityRequirement: cap2 }),
      createTestProposedStep({ id: 's3', name: 'S3', action: 'write_file', capabilityRequirement: cap1 }),
    ]

    const result = extractCapabilityRequirements(steps)
    expect(result).toHaveLength(2)
    expect(result).toContain(cap1)
    expect(result).toContain(cap2)
  })

  it('returns empty array when no capabilities', () => {
    const steps = [createTestProposedStep({ id: 's1', name: 'S1', action: 'read_file' })]
    expect(extractCapabilityRequirements(steps)).toEqual([])
  })
})

// ── extractWorkspaceRequirements Tests ───────────────────────────────────

describe('extractWorkspaceRequirements', () => {
  it('extracts unique workspace requirements from steps', () => {
    const ws1 = createTestWorkspaceId('ws-1')
    const ws2 = createTestWorkspaceId('ws-2')
    const steps = [
      createTestProposedStep({ id: 's1', name: 'S1', action: 'read_file', workspaceRequirement: ws1 }),
      createTestProposedStep({ id: 's2', name: 'S2', action: 'bash', workspaceRequirement: ws2 }),
      createTestProposedStep({ id: 's3', name: 'S3', action: 'write_file', workspaceRequirement: ws1 }),
    ]

    const result = extractWorkspaceRequirements(steps)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no workspace requirements', () => {
    const steps = [createTestProposedStep({ id: 's1', name: 'S1', action: 'read_file' })]
    expect(extractWorkspaceRequirements(steps)).toEqual([])
  })
})

// ── PlanValidator Tests ──────────────────────────────────────────────────

describe('PlanValidator', () => {
  let capabilityRegistry: CapabilityRegistry
  let workspaceManager: WorkspaceManager
  let validator: PlanValidator

  beforeEach(() => {
    capabilityRegistry = new CapabilityRegistry()
    workspaceManager = new WorkspaceManager({ basePath: '/tmp/test', logger }, events)
    validator = new PlanValidator(capabilityRegistry, workspaceManager)
  })

  it('validates a valid proposal', () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code analysis tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const proposal = createProposal(createReasoningId('r1'), 'Valid Plan', [
      createTestProposedStep({ id: 's1', name: 'Read', action: 'read_file', capabilityRequirement: cap }),
    ])
    proposal.capabilityRequirements.push(cap)

    const result = validator.validate(proposal)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects proposal with missing capability', () => {
    const cap = createTestCapabilityId('nonexistent')
    const proposal = createProposal(createReasoningId('r1'), 'Bad Plan', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file' }),
    ])
    proposal.capabilityRequirements.push(cap)

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'UNKNOWN_CAPABILITY')).toBe(true)
  })

  it('rejects proposal with step-level unknown capability', () => {
    const cap = createTestCapabilityId('nonexistent')
    const proposal = createProposal(createReasoningId('r1'), 'Bad Plan', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file', capabilityRequirement: cap }),
    ])

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'UNKNOWN_STEP_CAPABILITY')).toBe(true)
  })

  it('rejects proposal with invalid dependency reference', () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const proposal = createProposal(createReasoningId('r1'), 'Bad Deps', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file', dependencyIds: ['nonexistent'] }),
    ])

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'MISSING_DEPENDENCY')).toBe(true)
  })

  it('rejects proposal with cyclic dependencies', () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const proposal = createProposal(createReasoningId('r1'), 'Cyclic', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file', dependencyIds: ['s2'] }),
      createTestProposedStep({ id: 's2', name: 'Step 2', action: 'read_file', dependencyIds: ['s1'] }),
    ])

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'CYCLIC_DEPENDENCY')).toBe(true)
  })

  it('rejects proposal with unknown workspace', () => {
    const ws = createTestWorkspaceId('nonexistent')
    const proposal = createProposal(createReasoningId('r1'), 'Bad WS', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file' }),
    ])
    proposal.workspaceRequirements.push({ workspaceId: ws })

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'UNKNOWN_WORKSPACE')).toBe(true)
  })

  it('rejects proposal with unknown step action', () => {
    const proposal = createProposal(createReasoningId('r1'), 'Bad Action', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'nonexistent_tool' }),
    ])

    const result = validator.validate(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'UNKNOWN_ACTION')).toBe(true)
  })

  it('warns on empty proposal', () => {
    const proposal = createProposal(createReasoningId('r1'), 'Empty', [])

    const result = validator.validate(proposal)
    expect(result.warnings.some((w) => w.code === 'EMPTY_PROPOSAL')).toBe(true)
  })

  it('warns on large proposal', () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const LARGE_PROPOSAL_THRESHOLD = 101
    const steps = Array.from({ length: LARGE_PROPOSAL_THRESHOLD }, (_, i) =>
      createTestProposedStep({ id: `s${i}`, name: `Step ${i}`, action: 'read_file' }),
    )
    const proposal = createProposal(createReasoningId('r1'), 'Large', steps)

    const result = validator.validate(proposal)
    expect(result.warnings.some((w) => w.code === 'LARGE_PROPOSAL')).toBe(true)
  })

  it('normalizes proposal with default timeouts', () => {
    const proposal = createProposal(createReasoningId('r1'), 'Normalize', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
    ])

    const normalized = PlanValidator.normalize(proposal)
    expect(normalized.steps[0]!.timeoutMs).toBe(30_000)
    expect(normalized.steps[0]!.dependencyIds).toEqual([])
  })
})

// ── MockCognitionProvider Tests ──────────────────────────────────────────

describe('MockCognitionProvider', () => {
  let provider: MockCognitionProvider

  beforeEach(() => {
    provider = new MockCognitionProvider()
  })

  function makeRequest(prompt: string): CognitionRequest {
    return {
      id: createReasoningId('test-req'),
      context: {
        availableCapabilities: [],
        availableWorkspaces: [],
      },
      prompt,
      metadata: {},
      createdAt: new Date().toISOString(),
    }
  }

  it('matches fixtures by prompt pattern', async () => {
    const fixture = createProposal(createReasoningId('fixture-req'), 'Fixture Plan', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
    ])
    provider.registerFixture('scan', fixture)

    const response = await provider.generatePlanProposal(makeRequest('scan the codebase'))
    expect(response.proposal.name).toBe('Fixture Plan')
    expect(response.proposal.steps).toHaveLength(1)
  })

  it('returns default proposal when no fixture matches', async () => {
    const defaultProposal = createProposal(createReasoningId('default-req'), 'Default Plan', [
      createTestProposedStep({ id: 's1', name: 'Default Step', action: 'read_file' }),
    ])
    provider.setDefaultProposal(defaultProposal)

    const response = await provider.generatePlanProposal(makeRequest('something random'))
    expect(response.proposal.name).toBe('Default Plan')
  })

  it('throws when no fixture matches and no default', async () => {
    await expect(provider.generatePlanProposal(makeRequest('unknown prompt'))).rejects.toThrow(
      'No matching fixture or default proposal',
    )
  })

  it('throws on cancellation', async () => {
    const source = new CancellationTokenSource()
    source.cancel()

    await expect(provider.generatePlanProposal(makeRequest('scan'), source.token)).rejects.toThrow('Task cancelled')
  })

  it('returns correct model info', () => {
    const info = provider.getModelInfo()
    expect(info.provider).toBe('mock')
    expect(info.model).toBe('mock-v1')
  })

  it('is always available', async () => {
    expect(await provider.isAvailable()).toBe(true)
  })

  it('includes reasoning trace in response', async () => {
    const fixture = createProposal(createReasoningId('fixture-req'), 'Fixture', [
      createTestProposedStep({ id: 's1', name: 'Step 1', action: 'read_file' }),
    ])
    provider.registerFixture('test', fixture)

    const response = await provider.generatePlanProposal(makeRequest('test'))
    expect(response.reasoning.entries.length).toBeGreaterThan(0)
    expect(response.reasoning.summary).toContain('Mock reasoning')
    expect(response.reasoning.entries[0]!.type).toBe('analysis')
  })
})

// ── CognitionCoordinator Tests ───────────────────────────────────────────

describe('CognitionCoordinator', () => {
  let coordinator: CognitionCoordinator
  let provider: MockCognitionProvider
  let capabilityRegistry: CapabilityRegistry
  let workspaceManager: WorkspaceManager
  let eventStore: InMemoryEventStore

  beforeEach(() => {
    capabilityRegistry = new CapabilityRegistry()
    workspaceManager = new WorkspaceManager({ basePath: '/tmp/test', logger }, events)
    provider = new MockCognitionProvider()
    eventStore = new InMemoryEventStore()

    const validator = new PlanValidator(capabilityRegistry, workspaceManager)
    coordinator = new CognitionCoordinator(provider, validator, events, logger, { eventStore })
  })

  function makeContext(overrides: Partial<CognitionContext> = {}): CognitionContext {
    return {
      availableCapabilities: [],
      availableWorkspaces: [],
      ...overrides,
    }
  }

  it('runs full pipeline: request → proposal → validation → plan', async () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const fixture = createProposal(createReasoningId('fixture'), 'Scan Project', [
      createTestProposedStep({ id: 's1', name: 'Scan', action: 'read_file', capabilityRequirement: cap }),
    ])
    provider.registerFixture('scan', fixture)

    const result = await coordinator.proposePlan(makeContext({ availableCapabilities: [cap] }), 'scan project')

    expect(result.accepted).toBe(true)
    expect(result.plan).toBeDefined()
    expect(result.plan!.name).toBe('Scan Project')
    expect(result.validationResult.valid).toBe(true)
  })

  it('preserves rejected proposal with validation errors', async () => {
    const cap = createTestCapabilityId('nonexistent')
    const fixture = createProposal(createReasoningId('fixture'), 'Bad Plan', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file' }),
    ])
    // Force the capability requirement to trigger validation failure.
    fixture.capabilityRequirements.push(cap)
    provider.registerFixture('bad', fixture)

    const result = await coordinator.proposePlan(makeContext({ availableCapabilities: [] }), 'bad plan')

    expect(result.accepted).toBe(false)
    expect(result.plan).toBeUndefined()
    expect(result.validationResult.valid).toBe(false)
    expect(result.validationResult.errors.length).toBeGreaterThan(0)
  })

  it('emits cognition events during pipeline', async () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const fixture = createProposal(createReasoningId('fixture'), 'Scan', [
      createTestProposedStep({ id: 's1', name: 'Scan', action: 'read_file', capabilityRequirement: cap }),
    ])
    provider.registerFixture('scan', fixture)

    const emittedEvents: string[] = []
    events.on('cognition.requested', () => emittedEvents.push('requested'))
    events.on('cognition.completed', () => emittedEvents.push('completed'))
    events.on('plan.proposed', () => emittedEvents.push('proposed'))
    events.on('plan.validated', () => emittedEvents.push('validated'))

    await coordinator.proposePlan(makeContext({ availableCapabilities: [cap] }), 'scan')

    expect(emittedEvents).toContain('requested')
    expect(emittedEvents).toContain('completed')
    expect(emittedEvents).toContain('proposed')
    expect(emittedEvents).toContain('validated')
  })

  it('emits plan.rejected event on validation failure', async () => {
    const cap = createTestCapabilityId('nonexistent')
    const fixture = createProposal(createReasoningId('fixture'), 'Bad', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file' }),
    ])
    fixture.capabilityRequirements.push(cap)
    provider.registerFixture('bad', fixture)

    let rejectedEmitted = false
    events.on('plan.rejected', () => {
      rejectedEmitted = true
    })

    await coordinator.proposePlan(makeContext({ availableCapabilities: [] }), 'bad')

    expect(rejectedEmitted).toBe(true)
  })

  it('validates an existing proposal', () => {
    const proposal = createProposal(createReasoningId('r1'), 'Test', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'nonexistent_tool' }),
    ])

    const result = coordinator.validateProposal(proposal)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'UNKNOWN_ACTION')).toBe(true)
  })

  it('accepts a validated proposal', () => {
    const cap = createTestCapabilityId('code')
    capabilityRegistry.register({
      id: cap,
      name: 'Code Tools',
      description: 'Code tools',
      moduleId: 'code',
      tools: [
        {
          id: createToolId('read_file'),
          name: 'Read File',
          description: 'Read a file',
          capabilityId: cap,
          inputSchema: {},
          outputSchema: {},
        },
      ],
    })

    const proposal = createProposal(createReasoningId('r1'), 'Good Plan', [
      createTestProposedStep({ id: 's1', name: 'Step', action: 'read_file', capabilityRequirement: cap }),
    ])

    const plan = CognitionCoordinator.acceptProposal(proposal, { sessionId: 'test-session' })
    expect(plan.name).toBe('Good Plan')
    expect(plan.sessionId).toBe('test-session')
    expect(plan.status).toBe('draft')
  })
})

// ── Persistence Integration Tests ────────────────────────────────────────

describe('Cognition Persistence', () => {
  it('includes proposals in RuntimeSnapshot', async () => {
    const store = new InMemorySnapshotStore()
    const snapshotManager = new SnapshotManager(store, events)

    const proposals: SerializedProposal[] = [
      {
        id: 'prop-1',
        requestId: 'reasoning-1',
        name: 'Test Proposal',
        steps: [{ id: 's1', name: 'Step 1', action: 'read_file', input: {} }],
        status: 'pending',
        modelInfo: { provider: 'mock', model: 'mock-v1' },
        createdAt: new Date().toISOString(),
      },
    ]

    snapshotManager.setCaptureProposals(() => proposals)
    snapshotManager.setCapturePlans(() => [])
    snapshotManager.setCaptureTasks(() => [])
    snapshotManager.setCaptureCapabilities(() => [])
    snapshotManager.setCaptureSessions(() => [])
    snapshotManager.setCaptureWorkspaces(() => [])

    const snapshot = await snapshotManager.takeSnapshot()
    expect(snapshot.proposals).toHaveLength(1)
    expect(snapshot.proposals[0]!.name).toBe('Test Proposal')
    expect(snapshot.proposals[0]!.status).toBe('pending')
  })

  it('includes reasoning traces in RuntimeSnapshot', async () => {
    const store = new InMemorySnapshotStore()
    const snapshotManager = new SnapshotManager(store, events)

    const traces: SerializedReasoningTrace[] = [
      {
        id: 'reasoning-1',
        proposalId: 'prop-1',
        entries: [
          {
            timestamp: new Date().toISOString(),
            type: 'analysis',
            content: 'Analyzing request',
          },
        ],
        summary: 'Test reasoning',
        modelInfo: { provider: 'mock', model: 'mock-v1' },
        startedAt: new Date().toISOString(),
      },
    ]

    snapshotManager.setCaptureReasoningTraces(() => traces)
    snapshotManager.setCapturePlans(() => [])
    snapshotManager.setCaptureTasks(() => [])
    snapshotManager.setCaptureCapabilities(() => [])
    snapshotManager.setCaptureSessions(() => [])
    snapshotManager.setCaptureWorkspaces(() => [])
    snapshotManager.setCaptureProposals(() => [])

    const snapshot = await snapshotManager.takeSnapshot()
    expect(snapshot.reasoningTraces).toHaveLength(1)
    expect(snapshot.reasoningTraces[0]!.summary).toBe('Test reasoning')
    expect(snapshot.reasoningTraces[0]!.entries).toHaveLength(1)
  })

  it('preserves existing snapshot behavior with cognition fields', async () => {
    const store = new InMemorySnapshotStore()
    const snapshotManager = new SnapshotManager(store, events)

    // All capture functions return empty arrays (default).
    const snapshot = await snapshotManager.takeSnapshot()

    // Existing fields should still work.
    expect(snapshot.plans).toEqual([])
    expect(snapshot.tasks).toEqual([])
    expect(snapshot.capabilities).toEqual([])
    expect(snapshot.sessions).toEqual([])
    expect(snapshot.workspaces).toEqual([])

    // New fields should be present.
    expect(snapshot.proposals).toEqual([])
    expect(snapshot.reasoningTraces).toEqual([])
  })
})

// ── Replay Consistency Tests ─────────────────────────────────────────────

describe('Replay Consistency', () => {
  it('replaying cognition events produces consistent state', async () => {
    const eventStore = new InMemoryEventStore()

    // Directly append events to the store (simulating what the coordinator does).
    await eventStore.append({
      timestamp: new Date().toISOString(),
      source: 'cognition-coordinator',
      type: 'cognition.requested',
      requestId: createReasoningId('r1') as string,
      sessionId: 'session-1',
    } as unknown as AiriEvent)

    await eventStore.append({
      timestamp: new Date().toISOString(),
      source: 'cognition-coordinator',
      type: 'plan.proposed',
      proposalId: createProposalId('p1') as string,
      requestId: createReasoningId('r1') as string,
      name: 'Test Plan',
      stepCount: 3,
      confidence: 0.9,
    } as unknown as AiriEvent)

    await eventStore.append({
      timestamp: new Date().toISOString(),
      source: 'cognition-coordinator',
      type: 'plan.validated',
      proposalId: createProposalId('p1') as string,
      planId: 'plan-1',
      validationResult: { valid: true, errors: [], warnings: [] },
    } as unknown as AiriEvent)

    // Verify events were stored.
    const count = await eventStore.getEventCount()
    expect(count).toBe(3)

    // Verify events can be replayed.
    const allEvents = await eventStore.getAll()
    expect(allEvents).toHaveLength(3)
    expect(allEvents[0]!.type).toBe('cognition.requested')
    expect(allEvents[1]!.type).toBe('plan.proposed')
    expect(allEvents[2]!.type).toBe('plan.validated')
  })
})
