/**
 * Workspace Sandbox Tests
 *
 * Tests for workspace-scoped tool execution, lease validation,
 * and filesystem constraints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { EventBus } from '../events/bus.js'
import { CapabilityRegistry } from '../capabilities/registry.js'
import { LocalToolRuntime } from '../runtime/local-tool-runtime.js'
import { createCancellationToken } from '../tasks/cancellation.js'
import type { WorkspaceContext, ToolExecutionContext } from '../capabilities/types.js'
import { createToolId, createCapabilityId } from '../capabilities/types.js'
import { createWorkspaceId } from '../workspace/types.js'
import { WorkspaceManager } from '../workspace/manager.js'

// ── Helpers ─────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'airi-sandbox-test-'))
}

function createTestRuntime(workspaceManager?: WorkspaceManager): {
  events: EventBus
  registry: CapabilityRegistry
  runtime: LocalToolRuntime
} {
  const events = new EventBus()
  const registry = new CapabilityRegistry()
  const runtime = new LocalToolRuntime(registry, events, undefined, workspaceManager)
  return { events, registry, runtime }
}

function createToolCtx(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    taskId: 'task-test' as unknown as ToolExecutionContext['taskId'],
    cancellationToken: createCancellationToken().token,
    timeoutMs: 30_000,
    metadata: {},
    ...overrides,
  }
}

// ── WorkspaceContext in ToolExecutionContext ────────────────────────────

describe('WorkspaceContext in ToolExecutionContext', () => {
  it('can be included in ToolExecutionContext', () => {
    const wsContext: WorkspaceContext = {
      workspaceId: createWorkspaceId('ws-1'),
      rootPath: '/tmp/workspace',
    }

    const ctx: ToolExecutionContext = {
      taskId: 'task-1' as unknown as ToolExecutionContext['taskId'],
      workspaceContext: wsContext,
      cancellationToken: createCancellationToken().token,
      timeoutMs: 30_000,
      metadata: {},
    }

    expect(ctx.workspaceContext).toBeDefined()
    expect(ctx.workspaceContext!.workspaceId).toBe('ws-1')
    expect(ctx.workspaceContext!.rootPath).toBe('/tmp/workspace')
  })

  it('is optional — existing code without workspace context still works', () => {
    const ctx: ToolExecutionContext = {
      taskId: 'task-1' as unknown as ToolExecutionContext['taskId'],
      cancellationToken: createCancellationToken().token,
      timeoutMs: 30_000,
      metadata: {},
    }

    expect(ctx.workspaceContext).toBeUndefined()
  })

  it('supports worktree path in workspace context', () => {
    const wsContext: WorkspaceContext = {
      workspaceId: createWorkspaceId('ws-1'),
      rootPath: '/tmp/workspace',
      worktreePath: '/tmp/workspace/.airi-worktrees/ws-1',
      leaseToken: 'token-abc',
    }

    expect(wsContext.worktreePath).toBeDefined()
    expect(wsContext.leaseToken).toBe('token-abc')
  })
})

// ── Workspace-scoped tool execution ──────────────────────────────────────

describe('Workspace-scoped tool execution', () => {
  let basePath: string
  let manager: WorkspaceManager

  beforeEach(() => {
    basePath = tmpDir()
    const events = new EventBus()
    manager = new WorkspaceManager({ basePath }, events)
  })

  afterEach(() => {
    fs.rmSync(basePath, { recursive: true, force: true })
  })

  it('validates lease before executing workspace-scoped tools', async () => {
    const { registry, runtime } = createTestRuntime(manager)

    // Register a test tool.
    const toolId = createToolId('test.tool')
    registry.register({
      id: createCapabilityId('test'),
      name: 'Test Tool',
      description: 'A test tool',
      moduleId: 'test',
      tools: [
        {
          id: toolId,
          name: 'Test Tool',
          description: 'A test tool',
          capabilityId: createCapabilityId('test') as unknown as import('../capabilities/types.js').CapabilityId,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    let handlerCalled = false
    runtime.registerHandler(toolId, () => {
      handlerCalled = true
      return Promise.resolve('ok')
    })

    // Create a workspace and lease it.
    const ws = await manager.createWorkspace({
      name: 'lease-ws',
      rootPath: path.join(basePath, 'ws'),
    })
    const lease = manager.leaseWorkspace(ws.id, 'session-1')

    // Execute with valid workspace context.
    const ctx = createToolCtx({
      workspaceContext: {
        workspaceId: ws.id,
        rootPath: ws.rootPath,
        leaseToken: lease.leaseToken,
      },
    })

    const result = await runtime.execute(toolId, {}, ctx)
    expect(result.success).toBe(true)
    expect(handlerCalled).toBe(true)
  })

  it('rejects execution with invalid lease token', async () => {
    const { registry, runtime } = createTestRuntime(manager)

    const toolId = createToolId('test.tool')
    registry.register({
      id: createCapabilityId('test'),
      name: 'Test Tool',
      description: 'A test tool',
      moduleId: 'test',
      tools: [
        {
          id: toolId,
          name: 'Test Tool',
          description: 'A test tool',
          capabilityId: createCapabilityId('test') as unknown as import('../capabilities/types.js').CapabilityId,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    runtime.registerHandler(toolId, () => Promise.resolve('ok'))

    const ws = await manager.createWorkspace({
      name: 'lease-ws',
      rootPath: path.join(basePath, 'ws'),
    })

    // Execute with invalid lease token.
    const ctx = createToolCtx({
      workspaceContext: {
        workspaceId: ws.id,
        rootPath: ws.rootPath,
        leaseToken: 'invalid-token',
      },
    })

    const result = await runtime.execute(toolId, {}, ctx)
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('LEASE_INVALID')
  })

  it('executes without workspace context (backward compatibility)', async () => {
    const { registry, runtime } = createTestRuntime(manager)

    const toolId = createToolId('test.tool')
    registry.register({
      id: createCapabilityId('test'),
      name: 'Test Tool',
      description: 'A test tool',
      moduleId: 'test',
      tools: [
        {
          id: toolId,
          name: 'Test Tool',
          description: 'A test tool',
          capabilityId: createCapabilityId('test') as unknown as import('../capabilities/types.js').CapabilityId,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    runtime.registerHandler(toolId, () => Promise.resolve('ok'))

    // No workspace context — should still work.
    const ctx = createToolCtx()

    const result = await runtime.execute(toolId, {}, ctx)
    expect(result.success).toBe(true)
  })

  it('executes without workspace manager (backward compatibility)', async () => {
    const { registry, runtime } = createTestRuntime(undefined)

    const toolId = createToolId('test.tool')
    registry.register({
      id: createCapabilityId('test'),
      name: 'Test Tool',
      description: 'A test tool',
      moduleId: 'test',
      tools: [
        {
          id: toolId,
          name: 'Test Tool',
          description: 'A test tool',
          capabilityId: createCapabilityId('test') as unknown as import('../capabilities/types.js').CapabilityId,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    runtime.registerHandler(toolId, () => Promise.resolve('ok'))

    const ctx = createToolCtx({
      workspaceContext: {
        workspaceId: createWorkspaceId('ws-1'),
        rootPath: '/tmp/workspace',
      },
    })

    // No workspace manager — should still work (no lease validation).
    const result = await runtime.execute(toolId, {}, ctx)
    expect(result.success).toBe(true)
  })
})

// ── Filesystem constraint ───────────────────────────────────────────────

describe('Filesystem constraint', () => {
  it('validates paths within workspace root', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('node:path')
    const root = '/home/user/workspace'

    // Valid path.
    const target1 = 'src/index.ts'
    const resolved1 = path.resolve(root, target1)
    const relative1 = path.relative(root, resolved1)
    expect(relative1.startsWith('..')).toBe(false)

    // Invalid path — escapes workspace.
    const target2 = '../../etc/passwd'
    const resolved2 = path.resolve(root, target2)
    const relative2 = path.relative(root, resolved2)
    expect(relative2.startsWith('..')).toBe(true)
  })
})
