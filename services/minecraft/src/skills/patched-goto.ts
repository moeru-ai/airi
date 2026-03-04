import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

import { useLogger } from '../utils/logger'

const logger = useLogger()

// --- ETA Calibration Constants ---
const SPRINT_SPEED = 5.6 // blocks/s
// NOTICE: WALK_SPEED kept as reference for non-sprinting ETA calculations

const _WALK_SPEED = 4.3 // blocks/s
const JUMP_TIME = 0.6 // seconds per jump move
const PARKOUR_TIME = 1.0 // seconds per parkour move
const PLACE_TIME = 0.5 // seconds per block placement
const GRACE_FACTOR = 2.0 // multiply ETA by this for timeout
const BASE_GRACE_S = 10 // minimum grace seconds
const MIN_TIMEOUT_MS = 15_000 // absolute floor 15s
const MAX_TIMEOUT_MS = 300_000 // absolute ceiling 5min

// --- Progress / Stagnation ---
const PROGRESS_INTERVAL_MS = 5_000 // check progress every 5s
const STAGNATION_THRESHOLD = 1.5 // blocks — less than this = stagnant
const MAX_STAGNANT_TICKS = 3 // 3 stagnant ticks (~15s) → cancel

export interface PathfindResult {
  ok: boolean
  reason: 'success' | 'timeout' | 'stagnation' | 'noPath' | 'error' | 'interrupted'
  message: string
  startPos: { x: number, y: number, z: number }
  endPos: { x: number, y: number, z: number }
  distanceTraveled: number
  distanceToTarget: number
  elapsedMs: number
  estimatedTimeMs: number
  pathCost: number
}

export interface PathfindProgressInfo {
  elapsedMs: number
  estimatedTimeMs: number
  distanceTraveled: number
  distanceToTarget: number
  currentPos: { x: number, y: number, z: number }
  stagnantTicks: number
  pathCost: number
}

interface MoveNode {
  x: number
  y: number
  z: number
  cost: number
  toBreak: Array<{ x: number, y: number, z: number }>
  toPlace: Array<{ x: number, y: number, z: number }>
  parkour?: boolean
}

interface PathUpdateResult {
  status: string
  cost: number
  path: MoveNode[]
}

function vecToCoord(v: Vec3): { x: number, y: number, z: number } {
  return { x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10, z: Math.round(v.z * 10) / 10 }
}

/**
 * Estimate real-world seconds to traverse a computed A* path.
 *
 * Walks each Move node and sums up time for walking, digging, placing, and parkour.
 * The dig time is estimated from the cost model: `laborCost = (1 + 3 * digTime_ms / 1000) * digCost`.
 * Since digCost defaults to 1, we can reverse: `digTime_ms ≈ (laborCost - 1) * 1000 / 3`.
 * But we don't have per-block labor cost separated out. Instead, we use heuristics:
 * - Each toBreak block: ~1.5s average (conservative; stone with iron pick is ~0.75s, obsidian is 9.4s)
 * - Each toPlace block: ~0.5s
 * - Parkour moves: ~1.0s
 * - Jump moves (cost >= 2 without parkour): ~0.6s
 * - Normal moves: distance / walk speed
 */
export function estimatePathTimeMs(path: MoveNode[]): number {
  if (path.length === 0)
    return 0

  let totalTimeS = 0

  for (let i = 0; i < path.length; i++) {
    const node = path[i]

    // Dig time: each block to break
    totalTimeS += node.toBreak.length * 1.5

    // Place time: each block to place
    totalTimeS += node.toPlace.length * PLACE_TIME

    if (node.parkour) {
      totalTimeS += PARKOUR_TIME
    }
    else if (node.cost >= 2 && node.toBreak.length === 0 && node.toPlace.length === 0) {
      // Jump move (cost=2 base for jump-up)
      totalTimeS += JUMP_TIME
    }
    else {
      // Normal walking move — estimate from node distance
      // Diagonal moves have cost √2, forward moves cost 1
      const walkDistance = node.cost >= 1.4 ? Math.SQRT2 : 1
      totalTimeS += walkDistance / SPRINT_SPEED
    }
  }

  return totalTimeS * 1000
}

/**
 * Compute a timeout from the estimated path time.
 * timeout = ETA * graceFactor + baseGrace, clamped to [MIN, MAX].
 */
export function computeTimeoutFromEta(estimatedMs: number): number {
  const timeoutMs = estimatedMs * GRACE_FACTOR + BASE_GRACE_S * 1000
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, timeoutMs))
}

/**
 * A robust pathfinding wrapper that provides:
 * - ETA-based dynamic timeout (recalculated on path replanning)
 * - Periodic progress tracking with stagnation detection
 * - Structured result with telemetry
 * - Optional progress callback for LLM feedback
 *
 * Uses `bot.pathfinder.setGoal` directly (not `goto`) for full event control.
 */
export function patchedGoto(
  bot: Bot,
  goal: any,
  options: {
    onProgress?: (info: PathfindProgressInfo) => void
  } = {},
): Promise<PathfindResult> {
  return new Promise((resolve) => {
    const startPos = bot.entity.position.clone()
    const startTime = Date.now()
    let lastProgressPos = startPos.clone()
    let stagnantTicks = 0
    let currentEstimatedMs = 0
    let currentTimeoutMs = MIN_TIMEOUT_MS
    let currentPathCost = 0
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let progressTimer: ReturnType<typeof setInterval> | null = null
    let settled = false

    function getDistanceToTarget(): number {
      try {
        // Use the goal's heuristic if available, otherwise euclidean to start target
        if (goal && typeof goal.heuristic === 'function') {
          return goal.heuristic(bot.entity.position.floored())
        }
      }
      catch {}
      return 0
    }

    function buildResult(ok: boolean, reason: PathfindResult['reason'], message: string): PathfindResult {
      const endPos = bot.entity.position.clone()
      return {
        ok,
        reason,
        message,
        startPos: vecToCoord(startPos),
        endPos: vecToCoord(endPos),
        distanceTraveled: startPos.distanceTo(endPos),
        distanceToTarget: getDistanceToTarget(),
        elapsedMs: Date.now() - startTime,
        estimatedTimeMs: currentEstimatedMs,
        pathCost: currentPathCost,
      }
    }

    function cleanup() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      if (progressTimer) {
        clearInterval(progressTimer)
        progressTimer = null
      }
      bot.removeListener('goal_reached', onGoalReached)
      bot.removeListener('path_update', onPathUpdate)
      bot.removeListener('goal_updated', onGoalUpdated)
      bot.removeListener('path_stop', onPathStop)
    }

    function settle(result: PathfindResult) {
      if (settled)
        return
      settled = true
      cleanup()
      // Resolve on next tick to let pathfinder clean up
      setTimeout(() => resolve(result), 0)
    }

    function resetTimeout() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
      }
      timeoutTimer = setTimeout(() => {
        logger.withFields({ elapsedMs: Date.now() - startTime, estimatedMs: currentEstimatedMs, timeoutMs: currentTimeoutMs }).log('Pathfinding timeout reached')
        try {
          bot.pathfinder.stop()
        }
        catch {}
        settle(buildResult(false, 'timeout', `Navigation timed out after ${Math.round((Date.now() - startTime) / 1000)}s (ETA was ${Math.round(currentEstimatedMs / 1000)}s)`))
      }, currentTimeoutMs)
    }

    // --- Event handlers ---

    function onGoalReached() {
      settle(buildResult(true, 'success', 'Reached the goal'))
    }

    function onPathUpdate(results: PathUpdateResult) {
      // Recalculate ETA from the new path
      if (results.path && results.path.length > 0) {
        currentEstimatedMs = estimatePathTimeMs(results.path)
        currentTimeoutMs = computeTimeoutFromEta(currentEstimatedMs)
        currentPathCost = results.cost
        resetTimeout()
      }

      // Check for noPath / timeout from A* computation
      // Only fail when the path is empty AND status indicates failure.
      // If there's a partial path, the bot should walk it while A* continues.
      if (results.path.length === 0) {
        if (results.status === 'noPath') {
          settle(buildResult(false, 'noPath', 'No path to the goal'))
        }
        else if (results.status === 'timeout') {
          settle(buildResult(false, 'noPath', 'Pathfinding computation timed out (A* could not find a path in time)'))
        }
        // else: empty path but status is 'partial' — still computing, don't fail yet
      }
    }

    function onGoalUpdated(newGoal: any) {
      if (newGoal !== goal) {
        settle(buildResult(false, 'interrupted', 'Goal was changed externally'))
      }
    }

    function onPathStop() {
      settle(buildResult(false, 'interrupted', 'Path was stopped'))
    }

    // --- Progress ticker ---
    function checkProgress() {
      if (settled)
        return

      const currentPos = bot.entity.position.clone()
      const movedSinceLastTick = currentPos.distanceTo(lastProgressPos)

      if (movedSinceLastTick < STAGNATION_THRESHOLD) {
        stagnantTicks++
      }
      else {
        stagnantTicks = 0
      }
      lastProgressPos = currentPos

      const progressInfo: PathfindProgressInfo = {
        elapsedMs: Date.now() - startTime,
        estimatedTimeMs: currentEstimatedMs,
        distanceTraveled: startPos.distanceTo(currentPos),
        distanceToTarget: getDistanceToTarget(),
        currentPos: vecToCoord(currentPos),
        stagnantTicks,
        pathCost: currentPathCost,
      }

      // Notify callback
      options.onProgress?.(progressInfo)

      // Check stagnation limit
      if (stagnantTicks >= MAX_STAGNANT_TICKS) {
        logger.withFields({ stagnantTicks, pos: vecToCoord(currentPos) }).log('Pathfinding stagnation detected')
        try {
          bot.pathfinder.stop()
        }
        catch {}
        settle(buildResult(false, 'stagnation', `Bot stagnated for ${stagnantTicks * PROGRESS_INTERVAL_MS / 1000}s without meaningful movement`))
      }
    }

    // --- Start ---
    bot.on('goal_reached', onGoalReached)
    bot.on('path_update', onPathUpdate)
    bot.on('goal_updated', onGoalUpdated)
    bot.on('path_stop', onPathStop)

    // Set initial timeout (will be recalculated on first path_update)
    resetTimeout()

    // Start progress ticker
    progressTimer = setInterval(checkProgress, PROGRESS_INTERVAL_MS)

    // Kick off pathfinding
    try {
      bot.pathfinder.setGoal(goal)
    }
    catch (err) {
      settle(buildResult(false, 'error', `Failed to set pathfinding goal: ${(err as Error).message}`))
    }
  })
}
