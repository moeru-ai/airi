import type { TaskMemoryExtraction } from './types'

import { describe, expect, it } from 'vitest'

import { TaskMemoryManager } from './manager'
import { createEmptyTaskMemory, isTaskMemoryVisible, mergeTaskMemory } from './merge'
import { TASK_MEMORY_LIMITS } from './types'

// ---------------------------------------------------------------------------
// createEmptyTaskMemory
// ---------------------------------------------------------------------------
describe('createEmptyTaskMemory', () => {
  it('should create a task memory with expected defaults', () => {
    const tm = createEmptyTaskMemory('t-1')
    expect(tm.status).toBe('active')
    expect(tm.goal).toBeNull()
    expect(tm.confirmedFacts).toEqual([])
    expect(tm.artifacts).toEqual([])
    expect(tm.blockers).toEqual([])
    expect(tm.sourceTurnId).toBe('t-1')
    expect(tm.updatedAt).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// isTaskMemoryVisible
// ---------------------------------------------------------------------------
describe('isTaskMemoryVisible', () => {
  it('should return false for undefined', () => {
    expect(isTaskMemoryVisible(undefined)).toBe(false)
  })

  it('should return false for empty memory', () => {
    expect(isTaskMemoryVisible(createEmptyTaskMemory('t-1'))).toBe(false)
  })

  it('should return true when goal is set', () => {
    const tm = createEmptyTaskMemory('t-1')
    tm.goal = 'Build app'
    expect(isTaskMemoryVisible(tm)).toBe(true)
  })

  it('should return true when status is done', () => {
    const tm = createEmptyTaskMemory('t-1')
    tm.status = 'done'
    expect(isTaskMemoryVisible(tm)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// mergeTaskMemory — scalar overwrite
// ---------------------------------------------------------------------------
describe('mergeTaskMemory', () => {
  it('should overwrite scalar fields when provided', () => {
    const base = createEmptyTaskMemory('t-1')
    const ext: TaskMemoryExtraction = { goal: 'Deploy app', status: 'active', currentStep: 'building' }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })

    expect(merged.goal).toBe('Deploy app')
    expect(merged.currentStep).toBe('building')
    expect(merged.status).toBe('active')
  })

  it('should not overwrite scalars with undefined', () => {
    const base = createEmptyTaskMemory('t-1')
    base.goal = 'Original'
    base.nextStep = 'Run tests'

    const ext: TaskMemoryExtraction = { goal: undefined, nextStep: undefined }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.goal).toBe('Original')
    expect(merged.nextStep).toBe('Run tests')
  })

  // ---------------------------------------------------------------------------
  // list dedup and trim
  // ---------------------------------------------------------------------------
  it('should deduplicate confirmedFacts', () => {
    const base = createEmptyTaskMemory('t-1')
    base.confirmedFacts = ['fact A', 'fact B']

    const ext: TaskMemoryExtraction = { confirmedFacts: ['fact B', 'fact C'] }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.confirmedFacts).toEqual(['fact A', 'fact B', 'fact C'])
  })

  it('should trim lists to TASK_MEMORY_LIMITS', () => {
    const base = createEmptyTaskMemory('t-1')
    base.confirmedFacts = Array.from({ length: TASK_MEMORY_LIMITS.confirmedFacts }, (_, i) => `fact-${i}`)

    const ext: TaskMemoryExtraction = { confirmedFacts: ['new-fact'] }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.confirmedFacts.length).toBe(TASK_MEMORY_LIMITS.confirmedFacts)
    expect(merged.confirmedFacts).toContain('new-fact')
  })

  it('should deduplicate artifacts by value+kind', () => {
    const base = createEmptyTaskMemory('t-1')
    base.artifacts = [{ label: 'config', value: '/etc/config.json', kind: 'file' }]

    const ext: TaskMemoryExtraction = {
      artifacts: [
        { label: 'config path', value: '/etc/config.json', kind: 'file' },
        { label: 'docs', value: 'https://docs.com', kind: 'url' },
      ],
    }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.artifacts.length).toBe(2)
    const configArtifact = merged.artifacts.find(a => a.value === '/etc/config.json')
    expect(configArtifact?.label).toBe('config path')
  })

  // ---------------------------------------------------------------------------
  // done convergence
  // ---------------------------------------------------------------------------
  it('should clear blockers/nextStep/recentFailureReason on status=done', () => {
    const base = createEmptyTaskMemory('t-1')
    base.blockers = ['waiting for CI']
    base.nextStep = 'Check CI'
    base.recentFailureReason = 'CI failed'

    const ext: TaskMemoryExtraction = { status: 'done' }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.status).toBe('done')
    expect(merged.blockers).toEqual([])
    expect(merged.nextStep).toBeNull()
    expect(merged.recentFailureReason).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // newTask soft reset
  // ---------------------------------------------------------------------------
  it('should soft-reset when newTask=true', () => {
    const base = createEmptyTaskMemory('t-1')
    base.goal = 'Old goal'
    base.confirmedFacts = ['old fact']
    base.status = 'done'

    const ext: TaskMemoryExtraction = { newTask: true, goal: 'New goal', status: 'active' }
    const merged = mergeTaskMemory({ existing: base, extraction: ext, sourceTurnId: 't-2' })
    expect(merged.goal).toBe('New goal')
    expect(merged.status).toBe('active')
    expect(merged.confirmedFacts).toEqual([])
  })

  it('should create new memory when existing is undefined', () => {
    const ext: TaskMemoryExtraction = { goal: 'First task', status: 'active' }
    const merged = mergeTaskMemory({ existing: undefined, extraction: ext, sourceTurnId: 't-1' })
    expect(merged.goal).toBe('First task')
    expect(merged.status).toBe('active')
    expect(merged.sourceTurnId).toBe('t-1')
  })
})

// ---------------------------------------------------------------------------
// TaskMemoryManager
// ---------------------------------------------------------------------------
describe('taskMemoryManager', () => {
  it('should start with no active memory', () => {
    const mgr = new TaskMemoryManager()
    expect(mgr.get()).toBeUndefined()
    expect(mgr.isVisible()).toBe(false)
  })

  it('should initialize with a sourceTurnId', () => {
    const mgr = new TaskMemoryManager()
    mgr.init({ sourceTurnId: 'turn-0', sourceTurnIndex: 0 })
    expect(mgr.get()).toBeDefined()
    expect(mgr.get()!.sourceTurnId).toBe('turn-0')
  })

  it('should update and return merged task memory', () => {
    const mgr = new TaskMemoryManager()
    const result = mgr.update({ goal: 'Build feature', status: 'active' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    expect(result.status).toBe('updated')
    if (result.status !== 'updated')
      throw new Error('expected update result')
    expect(result.taskMemory.goal).toBe('Build feature')
    expect(mgr.get()!.goal).toBe('Build feature')
  })

  it('should accumulate facts across updates', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Test', confirmedFacts: ['A'] }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    mgr.update({ confirmedFacts: ['B'] }, { sourceTurnId: 'turn-2', sourceTurnIndex: 2 })
    expect(mgr.get()!.confirmedFacts).toEqual(['A', 'B'])
  })

  it('should clear task memory', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Test' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    mgr.clear()
    expect(mgr.get()).toBeUndefined()
  })

  it('should produce a context string with content', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Deploy', status: 'active', currentStep: 'building' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    const ctx = mgr.toContextString()
    expect(ctx).toContain('Deploy')
    expect(ctx).toContain('active')
    expect(ctx).toContain('building')
  })

  it('should return fallback text when no memory', () => {
    const mgr = new TaskMemoryManager()
    expect(mgr.toContextString()).toBe('(no active task memory)')
  })

  it('should report visible when goal is set', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Something' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    expect(mgr.isVisible()).toBe(true)
  })

  it('should return null when update has no visible result', () => {
    const mgr = new TaskMemoryManager()
    // Empty extraction produces no visible content
    const result = mgr.update({}, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    expect(result.status).toBe('ignored-empty')
    expect(mgr.get()).toBeUndefined()
  })

  it('should track sourceTurnId across updates', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'First' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    mgr.update({ goal: 'Second' }, { sourceTurnId: 'turn-2', sourceTurnIndex: 2 })
    expect(mgr.get()!.goal).toBe('Second')
    expect(mgr.get()!.sourceTurnId).toBe('turn-2')
  })

  it('should allow multiple updates from the same turn id/index', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'First' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    const result = mgr.update({ currentStep: 'Refining' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    expect(result.status).toBe('updated')
    expect(mgr.get()!.currentStep).toBe('Refining')
  })

  it('should reject stale updates from an older turn index', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Newer' }, { sourceTurnId: 'turn-2', sourceTurnIndex: 2 })
    const result = mgr.update({ goal: 'Older' }, { sourceTurnId: 'turn-1', sourceTurnIndex: 1 })
    expect(result.status).toBe('ignored-stale')
    expect(mgr.get()!.goal).toBe('Newer')
  })

  it('should still reject older writes after a newer empty turn was observed', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Current' }, { sourceTurnId: 'turn-2', sourceTurnIndex: 2 })
    const emptyResult = mgr.update({}, { sourceTurnId: 'turn-3', sourceTurnIndex: 3 })
    expect(emptyResult.status).toBe('ignored-empty')

    const staleResult = mgr.update({ goal: 'Older' }, { sourceTurnId: 'turn-2-late', sourceTurnIndex: 2 })
    expect(staleResult.status).toBe('ignored-stale')
    expect(mgr.get()!.goal).toBe('Current')
  })

  it('should reject conflicting turn ids for the same turn index', () => {
    const mgr = new TaskMemoryManager()
    mgr.update({ goal: 'Current' }, { sourceTurnId: 'turn-2a', sourceTurnIndex: 2 })
    const result = mgr.update({ goal: 'Conflicting' }, { sourceTurnId: 'turn-2b', sourceTurnIndex: 2 })
    expect(result.status).toBe('ignored-stale')
    expect(mgr.get()!.goal).toBe('Current')
  })
})
