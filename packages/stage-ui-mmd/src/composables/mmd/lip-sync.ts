import type { Ref } from 'vue'
import type { Profile } from 'wlipsync'

import type { VowelSlot } from '../../constants/morphs'
import type { MorphController } from './morph'

import { useAsyncState } from '@vueuse/core'
import { onUnmounted, watch } from 'vue'
import { createWLipSyncNode } from 'wlipsync'

import profile from '../../assets/lip-sync-profile.json' with { type: 'json' }

// NOTICE:
// Cross-package source import (no package.json dependency) to reach the shared
// AudioContext. Root cause: the audio context is owned by `@proj-airi/stage-ui`,
// which in turn depends on this package, so adding it as a dependency would
// create a cycle. The VRM renderer reaches the same store the same way.
// Source: packages/stage-ui-three/src/composables/vrm/lip-sync.ts.
// Removal condition: the AudioContext provider moves to a dependency-free
// shared package both renderers can import.
import { useAudioContext } from '../../../../stage-ui/src/stores/audio'

/** wLipSync emits 6 visemes; we fold the sibilant `S` into `I`. */
const RAW_KEYS = ['A', 'E', 'I', 'O', 'U', 'S'] as const
type LipKey = 'A' | 'E' | 'I' | 'O' | 'U'
const LIP_KEYS: LipKey[] = ['A', 'E', 'I', 'O', 'U']

/** Maps wLipSync visemes onto the MMD vowel morph slots (あいうえお). */
const LIP_TO_SLOT: Record<LipKey, VowelSlot> = {
  A: 'vowelA',
  E: 'vowelE',
  I: 'vowelI',
  O: 'vowelO',
  U: 'vowelU',
}
const RAW_TO_LIP: Record<typeof RAW_KEYS[number], LipKey> = {
  A: 'A',
  E: 'E',
  I: 'I',
  O: 'O',
  U: 'U',
  S: 'I',
}

const ATTACK = 50 // approach speed toward the next mouth shape
const RELEASE = 30 // decay speed when a shape ends
const CAP = 0.7 // max morph weight, mirrors the VRM tuning
const SILENCE_VOL = 0.04
const SILENCE_GAIN = 0.05
const IDLE_MS = 160

/**
 * Audio-driven mouth animation for MMD models.
 *
 * Reuses the exact wLipSync profile and winner/runner blending strategy as
 * the VRM renderer (only the two strongest visemes are mixed, so the wide
 * "A" shape does not dominate), but writes the result to MMD vowel morphs
 * through a {@link MorphController} instead of VRM expressions.
 *
 * Returns an `update(delta)` to call once per frame, after the animation
 * helper has run, so lip-sync wins over any VMD mouth keyframes.
 */
export function useMMDLipSync(audioNode: Ref<AudioBufferSourceNode | undefined>) {
  const { audioContext } = useAudioContext()
  const { state: lipSyncNode, isReady } = useAsyncState(createWLipSyncNode(audioContext, profile as Profile), undefined)

  const smoothState: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
  let lastActiveAt = 0

  watch([isReady, audioNode], ([ready, newAudioNode], [, oldAudioNode]) => {
    if (oldAudioNode && oldAudioNode !== newAudioNode) {
      try {
        oldAudioNode.disconnect()
      }
      catch {}
    }
    if (!ready || !newAudioNode || !lipSyncNode.value)
      return
    try {
      newAudioNode.connect(lipSyncNode.value)
    }
    catch {}
  }, { immediate: true })

  onUnmounted(() => audioNode.value?.disconnect())

  function update(morphs: MorphController | undefined, delta = 0.016) {
    const node = lipSyncNode.value
    if (!morphs || !node)
      return

    const vol = node.volume ?? 0
    const amp = Math.min(vol * 0.9, 1) ** 0.7

    // Project the 6 raw visemes down to 5 vowels, scaled by amplitude.
    const projected: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
    for (const raw of RAW_KEYS) {
      const lip = RAW_TO_LIP[raw]
      const rawVal = node.weights[raw] ?? 0
      projected[lip] = Math.max(projected[lip], rawVal * amp)
    }

    // Only blend the two strongest vowels. Mixing all five biases toward the
    // wide "A" shape because it has the largest deformation.
    let winner: LipKey = 'I'
    let runner: LipKey = 'E'
    let winnerVal = -Infinity
    let runnerVal = -Infinity
    for (const key of LIP_KEYS) {
      const val = projected[key]
      if (val > winnerVal) {
        runnerVal = winnerVal
        runner = winner
        winnerVal = val
        winner = key
      }
      else if (val > runnerVal) {
        runnerVal = val
        runner = key
      }
    }

    // Treat low energy / brief gaps as silence so the mouth fully closes.
    const now = performance.now()
    let silent = amp < SILENCE_VOL || winnerVal < SILENCE_GAIN
    if (!silent)
      lastActiveAt = now
    if (now - lastActiveAt > IDLE_MS)
      silent = true

    const target: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
    if (!silent) {
      target[winner] = Math.min(CAP, winnerVal)
      target[runner] = Math.min(CAP * 0.5, runnerVal * 0.6)
    }

    for (const key of LIP_KEYS) {
      const from = smoothState[key]
      const to = target[key]
      const rate = 1 - Math.exp(-(to > from ? ATTACK : RELEASE) * delta)
      smoothState[key] = from + (to - from) * rate
      const weight = (smoothState[key] <= 0.01 ? 0 : smoothState[key]) * 0.7
      morphs.set(LIP_TO_SLOT[key], weight)
    }
  }

  return { update }
}
