import type { SpecArtifactName, SpecEntryPath, SpecPhase } from '@proj-airi/stage-ui/coding-workspace'
import { artifactNameForPhase, nextSpecPhase } from '@proj-airi/stage-ui/coding-workspace'

export const SPEC_MODE_ARTIFACT_APPROVAL_STATES = ['draft', 'approved'] as const
export type SpecModeArtifactApprovalState = (typeof SPEC_MODE_ARTIFACT_APPROVAL_STATES)[number]

export type SpecModeArtifactApprovals = Readonly<Record<SpecArtifactName, SpecModeArtifactApprovalState>>
export type SpecModeArtifactPaths = Readonly<Record<SpecArtifactName, string>>

export interface SpecModeState {
  readonly activeFeatureSlug: string
  readonly entryPath: SpecEntryPath
  readonly activePhase: SpecPhase
  readonly artifactApprovals: SpecModeArtifactApprovals
  readonly allowedWriteDirectory: string
  readonly allowedArtifactPaths: SpecModeArtifactPaths
}

export interface CreateSpecModeStateInput {
  featureSlug: string
  entryPath: SpecEntryPath
}

export type SpecModeTransitionBlockReason =
  | 'already-at-final-phase'
  | 'requirements-approval-required'
  | 'design-approval-required'

export type SpecModeTransitionResult =
  | {
      ok: true
      state: SpecModeState
    }
  | {
      ok: false
      reason: SpecModeTransitionBlockReason
      state: SpecModeState
    }

export type SpecModeExecutionBlocker =
  | 'tasks-phase-required'
  | 'requirements-approval-required'
  | 'requirements-confirmation-required'
  | 'design-approval-required'
  | 'tasks-approval-required'

export interface SpecModeExecutionReadiness {
  executionReady: boolean
  blockers: SpecModeExecutionBlocker[]
}

export type SpecModeWriteBlockReason =
  | 'invalid-workspace-path'
  | 'path-outside-active-spec-directory'
  | 'source-file-write-blocked'

export type SpecModeWritePathDecision =
  | {
      allowed: true
      normalizedPath: string
    }
  | {
      allowed: false
      normalizedPath?: string
      reason: SpecModeWriteBlockReason
    }

const SPEC_MODE_SPEC_ROOT = 'docs/specs'

const SPEC_MODE_ARTIFACT_ORDER = [
  'requirements.md',
  'design.md',
  'tasks.md',
] as const satisfies readonly SpecArtifactName[]

const initialPhaseByEntryPath = {
  'requirements-first': 'requirements',
  'design-first': 'design',
  'quick-spec': 'requirements',
} as const satisfies Record<SpecEntryPath, SpecPhase>

const sourceWritePathPrefixes = ['src/', 'apps/', 'packages/', 'core/'] as const

const featureSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSpecFeatureSlug(featureSlug: string): boolean {
  return featureSlugPattern.test(featureSlug)
}

export function specFeatureDirectoryPath(featureSlug: string): string {
  assertValidSpecFeatureSlug(featureSlug)

  return `${SPEC_MODE_SPEC_ROOT}/${featureSlug}`
}

export function specArtifactPath(featureSlug: string, artifactName: SpecArtifactName): string {
  return `${specFeatureDirectoryPath(featureSlug)}/${artifactName}`
}

export function requirementsArtifactPath(featureSlug: string): string {
  return specArtifactPath(featureSlug, artifactNameForPhase('requirements'))
}

export function designArtifactPath(featureSlug: string): string {
  return specArtifactPath(featureSlug, artifactNameForPhase('design'))
}

export function tasksArtifactPath(featureSlug: string): string {
  return specArtifactPath(featureSlug, artifactNameForPhase('tasks'))
}

export function createSpecModeState(input: CreateSpecModeStateInput): SpecModeState {
  const activeFeatureSlug = input.featureSlug
  const allowedWriteDirectory = specFeatureDirectoryPath(activeFeatureSlug)

  return {
    activeFeatureSlug,
    entryPath: input.entryPath,
    activePhase: initialPhaseByEntryPath[input.entryPath],
    artifactApprovals: createDraftArtifactApprovals(),
    allowedWriteDirectory,
    allowedArtifactPaths: createAllowedArtifactPaths(activeFeatureSlug),
  }
}

export function approveSpecArtifact(state: SpecModeState, artifactName: SpecArtifactName): SpecModeState {
  return {
    ...state,
    artifactApprovals: {
      ...state.artifactApprovals,
      [artifactName]: 'approved',
    },
  }
}

export function advanceSpecPhase(state: SpecModeState): SpecModeTransitionResult {
  const nextPhase = nextSpecPhase(state.activePhase)

  if (nextPhase == null) {
    return {
      ok: false,
      reason: 'already-at-final-phase',
      state,
    }
  }

  const blockReason = getPhaseTransitionBlockReason(state)

  if (blockReason != null) {
    return {
      ok: false,
      reason: blockReason,
      state,
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      activePhase: nextPhase,
    },
  }
}

export function getSpecExecutionReadiness(state: SpecModeState): SpecModeExecutionReadiness {
  const blockers: SpecModeExecutionBlocker[] = []

  if (state.activePhase !== 'tasks') blockers.push('tasks-phase-required')

  if (state.entryPath === 'requirements-first') {
    if (!isArtifactApproved(state, 'requirements.md')) blockers.push('requirements-approval-required')
    if (!isArtifactApproved(state, 'design.md')) blockers.push('design-approval-required')
  }

  if (state.entryPath === 'design-first') {
    if (!isArtifactApproved(state, 'requirements.md')) blockers.push('requirements-confirmation-required')
    if (!isArtifactApproved(state, 'design.md')) blockers.push('design-approval-required')
  }

  if (!isArtifactApproved(state, 'tasks.md')) blockers.push('tasks-approval-required')

  return {
    executionReady: blockers.length === 0,
    blockers,
  }
}

export function listAllowedSpecArtifactPaths(state: SpecModeState): string[] {
  return SPEC_MODE_ARTIFACT_ORDER.map((artifactName) => state.allowedArtifactPaths[artifactName])
}

export function validateSpecModeWritePath(state: SpecModeState, path: string): SpecModeWritePathDecision {
  const normalizedPath = normalizeWorkspaceRelativePath(path)

  if (normalizedPath == null) {
    return {
      allowed: false,
      reason: 'invalid-workspace-path',
    }
  }

  if (isPathInsideActiveSpecDirectory(state, normalizedPath)) {
    return {
      allowed: true,
      normalizedPath,
    }
  }

  if (isSourceWritePath(normalizedPath)) {
    return {
      allowed: false,
      normalizedPath,
      reason: 'source-file-write-blocked',
    }
  }

  return {
    allowed: false,
    normalizedPath,
    reason: 'path-outside-active-spec-directory',
  }
}

export function isSpecModeWritePathAllowed(state: SpecModeState, path: string): boolean {
  return validateSpecModeWritePath(state, path).allowed
}

function createDraftArtifactApprovals(): SpecModeArtifactApprovals {
  return {
    'requirements.md': 'draft',
    'design.md': 'draft',
    'tasks.md': 'draft',
  }
}

function createAllowedArtifactPaths(featureSlug: string): SpecModeArtifactPaths {
  return {
    'requirements.md': requirementsArtifactPath(featureSlug),
    'design.md': designArtifactPath(featureSlug),
    'tasks.md': tasksArtifactPath(featureSlug),
  }
}

function getPhaseTransitionBlockReason(state: SpecModeState): SpecModeTransitionBlockReason | undefined {
  if (state.entryPath === 'quick-spec') return undefined

  if (state.activePhase === 'requirements' && !isArtifactApproved(state, 'requirements.md'))
    return 'requirements-approval-required'

  if (state.activePhase === 'design' && !isArtifactApproved(state, 'design.md')) return 'design-approval-required'

  return undefined
}

function isArtifactApproved(state: SpecModeState, artifactName: SpecArtifactName): boolean {
  return state.artifactApprovals[artifactName] === 'approved'
}

function isPathInsideActiveSpecDirectory(state: SpecModeState, normalizedPath: string): boolean {
  return normalizedPath.startsWith(`${state.allowedWriteDirectory}/`)
}

function isSourceWritePath(normalizedPath: string): boolean {
  return sourceWritePathPrefixes.some((prefix) => normalizedPath.startsWith(prefix))
}

function normalizeWorkspaceRelativePath(path: string): string | undefined {
  if (path.length === 0 || path.includes('\0')) return undefined

  const normalizedSeparators = path.replaceAll('\\', '/')

  if (normalizedSeparators.startsWith('/') || /^[a-zA-Z]:\//.test(normalizedSeparators)) return undefined

  const segments: string[] = []

  for (const segment of normalizedSeparators.split('/')) {
    if (segment === '' || segment === '.') continue

    if (segment === '..') {
      if (segments.length === 0) return undefined

      segments.pop()
      continue
    }

    segments.push(segment)
  }

  if (segments.length === 0) return undefined

  return segments.join('/')
}

function assertValidSpecFeatureSlug(featureSlug: string): void {
  if (!isValidSpecFeatureSlug(featureSlug)) {
    throw new Error(
      `Invalid spec feature slug "${featureSlug}". Use lowercase letters, digits, and hyphen-separated words.`,
    )
  }
}
