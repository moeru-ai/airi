import type { ElectronGodotStageState } from '../../../../shared/eventa'

/**
 * Resolves whether a Godot status change crosses the active view-session boundary.
 *
 * Use when:
 * - Renderer-local Godot view state needs deterministic cleanup on sidecar shutdown
 * - Renderer-local Godot view state needs deterministic rebuild on sidecar startup
 *
 * Expects:
 * - `previousState` is the renderer's last observed Godot process state
 * - `nextState` is the newly observed Godot process state from invoke or push event
 *
 * Returns:
 * - `begin` when entering `running`
 * - `end` when leaving `running`
 */
export function resolveGodotViewSessionTransition(
  previousState: ElectronGodotStageState,
  nextState: ElectronGodotStageState,
) {
  return {
    begin: previousState !== 'running' && nextState === 'running',
    end: previousState === 'running' && nextState !== 'running',
  }
}

/**
 * Resolves whether a renderer-side Godot view push event can update settings state.
 *
 * Use when:
 * - Settings receives pushed Godot view snapshots or errors
 * - Late shutdown events must not repopulate inactive controls
 *
 * Expects:
 * - `state` is the renderer's latest observed Godot process state
 *
 * Returns:
 * - `true` only while Godot is running
 */
export function shouldAcceptGodotViewSessionEvent(state: ElectronGodotStageState) {
  return state === 'running'
}
