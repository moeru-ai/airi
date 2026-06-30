import { describe, expect, it } from 'vitest'

import {
  advanceSpecPhase,
  approveSpecArtifact,
  createSpecModeState,
  designArtifactPath,
  getSpecExecutionReadiness,
  listAllowedSpecArtifactPaths,
  requirementsArtifactPath,
  tasksArtifactPath,
  validateSpecModeWritePath,
} from './index'

describe('spec mode artifact state machine', () => {
  it('runs a requirements-first flow through pair approval gates', () => {
    let state = createSpecModeState({
      featureSlug: 'voice-settings',
      entryPath: 'requirements-first',
    })

    expect(state.activeFeatureSlug).toBe('voice-settings')
    expect(state.entryPath).toBe('requirements-first')
    expect(state.activePhase).toBe('requirements')

    expect(advanceSpecPhase(state)).toMatchObject({
      ok: false,
      reason: 'requirements-approval-required',
    })

    state = approveSpecArtifact(state, 'requirements.md')
    let advanced = advanceSpecPhase(state)

    expect(advanced.ok).toBe(true)
    if (advanced.ok) state = advanced.state

    expect(state.activePhase).toBe('design')
    expect(advanceSpecPhase(state)).toMatchObject({
      ok: false,
      reason: 'design-approval-required',
    })

    state = approveSpecArtifact(state, 'design.md')
    advanced = advanceSpecPhase(state)

    expect(advanced.ok).toBe(true)
    if (advanced.ok) state = advanced.state

    expect(state.activePhase).toBe('tasks')
    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: false,
      blockers: ['tasks-approval-required'],
    })

    state = approveSpecArtifact(state, 'tasks.md')

    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: true,
      blockers: [],
    })
  })

  it('allows design-first drafting but requires requirements confirmation before execution', () => {
    let state = createSpecModeState({
      featureSlug: 'persona-editor',
      entryPath: 'design-first',
    })

    expect(state.activePhase).toBe('design')
    expect(advanceSpecPhase(state)).toMatchObject({
      ok: false,
      reason: 'design-approval-required',
    })

    state = approveSpecArtifact(state, 'design.md')
    const advanced = advanceSpecPhase(state)

    expect(advanced.ok).toBe(true)
    if (advanced.ok) state = advanced.state

    expect(state.activePhase).toBe('tasks')

    state = approveSpecArtifact(state, 'tasks.md')

    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: false,
      blockers: ['requirements-confirmation-required'],
    })

    state = approveSpecArtifact(state, 'requirements.md')

    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: true,
      blockers: [],
    })
  })

  it('lets quick spec draft all artifacts before final execution approval', () => {
    let state = createSpecModeState({
      featureSlug: 'quick-avatar-presets',
      entryPath: 'quick-spec',
    })

    expect(state.activePhase).toBe('requirements')

    let advanced = advanceSpecPhase(state)

    expect(advanced.ok).toBe(true)
    if (advanced.ok) state = advanced.state

    expect(state.activePhase).toBe('design')

    advanced = advanceSpecPhase(state)

    expect(advanced.ok).toBe(true)
    if (advanced.ok) state = advanced.state

    expect(state.activePhase).toBe('tasks')
    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: false,
      blockers: ['tasks-approval-required'],
    })

    state = approveSpecArtifact(state, 'tasks.md')

    expect(getSpecExecutionReadiness(state)).toEqual({
      executionReady: true,
      blockers: [],
    })
  })

  it('builds canonical artifact paths and exposes allowed artifact write paths', () => {
    const state = createSpecModeState({
      featureSlug: 'code-mode-sandbox',
      entryPath: 'requirements-first',
    })

    expect(requirementsArtifactPath('code-mode-sandbox')).toBe('docs/specs/code-mode-sandbox/requirements.md')
    expect(designArtifactPath('code-mode-sandbox')).toBe('docs/specs/code-mode-sandbox/design.md')
    expect(tasksArtifactPath('code-mode-sandbox')).toBe('docs/specs/code-mode-sandbox/tasks.md')

    expect(state.allowedWriteDirectory).toBe('docs/specs/code-mode-sandbox')
    expect(state.allowedArtifactPaths).toEqual({
      'requirements.md': 'docs/specs/code-mode-sandbox/requirements.md',
      'design.md': 'docs/specs/code-mode-sandbox/design.md',
      'tasks.md': 'docs/specs/code-mode-sandbox/tasks.md',
    })
    expect(listAllowedSpecArtifactPaths(state)).toEqual([
      'docs/specs/code-mode-sandbox/requirements.md',
      'docs/specs/code-mode-sandbox/design.md',
      'docs/specs/code-mode-sandbox/tasks.md',
    ])
  })

  it('validates writes only inside the active feature spec directory', () => {
    const state = createSpecModeState({
      featureSlug: 'memory-timeline',
      entryPath: 'requirements-first',
    })

    expect(validateSpecModeWritePath(state, 'docs/specs/memory-timeline/requirements.md')).toEqual({
      allowed: true,
      normalizedPath: 'docs/specs/memory-timeline/requirements.md',
    })
    expect(validateSpecModeWritePath(state, './docs/specs/memory-timeline/research/notes.md')).toEqual({
      allowed: true,
      normalizedPath: 'docs/specs/memory-timeline/research/notes.md',
    })
    expect(validateSpecModeWritePath(state, 'docs/specs/other-feature/requirements.md')).toEqual({
      allowed: false,
      normalizedPath: 'docs/specs/other-feature/requirements.md',
      reason: 'path-outside-active-spec-directory',
    })
    expect(validateSpecModeWritePath(state, 'docs/specs/memory-timeline/../other-feature/design.md')).toEqual({
      allowed: false,
      normalizedPath: 'docs/specs/other-feature/design.md',
      reason: 'path-outside-active-spec-directory',
    })
  })

  it('blocks source-file writes in Spec mode', () => {
    const state = createSpecModeState({
      featureSlug: 'agent-toolbar',
      entryPath: 'requirements-first',
    })

    expect(validateSpecModeWritePath(state, 'packages/stage-ui/src/components/AgentToolbar.vue')).toEqual({
      allowed: false,
      normalizedPath: 'packages/stage-ui/src/components/AgentToolbar.vue',
      reason: 'source-file-write-blocked',
    })
    expect(validateSpecModeWritePath(state, 'src/main.ts')).toEqual({
      allowed: false,
      normalizedPath: 'src/main.ts',
      reason: 'source-file-write-blocked',
    })
  })
})
