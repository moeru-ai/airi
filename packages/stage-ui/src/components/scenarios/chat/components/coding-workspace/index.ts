import type { ChatToolCallRendererRegistry } from '../tool-call-renderer'

import {
  createDiagnosticsRendererModel,
  createSemanticSearchRendererModel,
  createSerenaNoticeRendererModel,
  createSpecPhaseStatusRendererModel,
  createSubagentJobStatusRendererModel,
} from './model'
import { createWorkspaceRendererCard } from './workspace-renderer-card'

export {
  createDiagnosticsRendererModel,
  createSemanticSearchRendererModel,
  createSerenaNoticeRendererModel,
  createSpecPhaseStatusRendererModel,
  createSubagentJobStatusRendererModel,
}
export type { WorkspaceRendererModel, WorkspaceRendererRow } from './model'

export const SemanticSearchRenderer = createWorkspaceRendererCard(
  'CodingWorkspaceSemanticSearchRenderer',
  createSemanticSearchRendererModel,
)

export const DiagnosticsRenderer = createWorkspaceRendererCard(
  'CodingWorkspaceDiagnosticsRenderer',
  createDiagnosticsRendererModel,
)

export const SpecPhaseStatusRenderer = createWorkspaceRendererCard(
  'CodingWorkspaceSpecPhaseStatusRenderer',
  createSpecPhaseStatusRendererModel,
)

export const SubagentJobStatusRenderer = createWorkspaceRendererCard(
  'CodingWorkspaceSubagentJobStatusRenderer',
  createSubagentJobStatusRendererModel,
)

export const SerenaNoticeRenderer = createWorkspaceRendererCard(
  'CodingWorkspaceSerenaNoticeRenderer',
  createSerenaNoticeRendererModel,
)

export const codingWorkspaceToolRendererRegistry = {
  workspace_status: SerenaNoticeRenderer,
  workspace_get_symbols_overview: SemanticSearchRenderer,
  workspace_find_symbol: SemanticSearchRenderer,
  workspace_find_declaration: SemanticSearchRenderer,
  workspace_find_references: SemanticSearchRenderer,
  workspace_get_diagnostics: DiagnosticsRenderer,
  workspace_search_pattern: SemanticSearchRenderer,
  workspace_ranked_context: SemanticSearchRenderer,
  workspace_update_spec_artifact: SpecPhaseStatusRenderer,
  workspace_create_subagent_job: SubagentJobStatusRenderer,
  workspace_update_subagent_job: SubagentJobStatusRenderer,
} satisfies ChatToolCallRendererRegistry
