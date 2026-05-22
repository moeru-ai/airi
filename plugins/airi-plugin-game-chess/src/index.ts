import type { ContextInit } from '@proj-airi/plugin-sdk'

import { defineGamelet, defineToolset } from '@proj-airi/plugin-sdk-tamagotchi'

import { chessTools } from './tools/chessTools'

/**
 * Stable gamelet identifier. The board UI is registered under this id and the
 * coach tools address the same gamelet through it.
 */
const GAMELET_ID = 'chess'

/** Plugin lifecycle hook — no eager work is needed before the host APIs exist. */
export async function init(): Promise<void> {}

/** Plugin lifecycle hook — the chess plugin has no host-configurable settings yet. */
export async function configure(): Promise<void> {}

/**
 * Registers the chess gamelet UI and the coach's analysis tools, then opens the
 * board.
 *
 * Use when:
 * - The plugin host reaches the module-setup lifecycle phase
 *
 * Expects:
 * - `apis` exposes the stage-tamagotchi gamelet kit and the tool registry
 */
export async function setupModules({ apis }: ContextInit): Promise<void> {
  try {
    await defineGamelet({ apis }, {
      id: GAMELET_ID,
      title: 'Chess',
      entrypoint: './ui/index.html',
      widgets: [{ id: 'main-board', kind: 'primary' }],
    })
    await defineToolset({ apis }, { tools: chessTools })

    // NOTICE:
    // AIRI v0.10.2 ships no user-facing launcher for plugin gamelets, so the
    // plugin surfaces its own board once registered.
    // Root cause: the gamelet kit exposes `gamelets.open(id)` but no host UI
    // calls it; a registered gamelet would otherwise never become visible.
    // Source: apps/stage-tamagotchi/src/main/services/airi/plugins/kits/gamelet.
    // Removal condition: drop this once an upstream gamelet launcher lands.
    const gamelets = (apis as { gamelets?: { open: (id: string) => Promise<void> } }).gamelets
    await gamelets?.open(GAMELET_ID)
  }
  catch (error) {
    console.error('[airi-plugin-game-chess] setupModules failed:', error)
    throw error
  }
}
