import type { VRMCore } from '@pixiv/three-vrm-core'
import type { Ref } from 'vue'
import type { Profile } from 'wlipsync'

import { useAsyncState } from '@vueuse/core'
import { onUnmounted, watch } from 'vue'
import { createWLipSyncNode } from 'wlipsync'

import profile from '../../assets/lip-sync-profile.json' with { type: 'json' }

import { useAudioContext } from '../../../../stage-ui/src/stores/audio'

export function useVRMLipSync(audioNode: Ref<AudioBufferSourceNode | undefined, AudioBufferSourceNode | undefined>) {
  const { audioContext } = useAudioContext()
  const { state: lipSyncNode, isReady } = useAsyncState(createWLipSyncNode(audioContext, profile as Profile), undefined)

  // https://github.com/mrxz/wLipSync/blob/c3bc4b321dc7e1ca333d75f7aa1e9e746cbbb23a/example/index.js#L50-L66
  const RAW_KEYS = ['A', 'E', 'I', 'O', 'U', 'S'] as const
  type LipKey = 'A' | 'E' | 'I' | 'O' | 'U'
  const LIP_KEYS: LipKey[] = ['A', 'E', 'I', 'O', 'U']
  const BLENDSHAPE_MAP: Record<LipKey, string> = {
    A: 'aa',
    E: 'ee',
    I: 'ih',
    O: 'oh',
    U: 'ou',
  }
  const RAW_TO_LIP: Record<typeof RAW_KEYS[number], LipKey> = {
    A: 'A',
    E: 'E',
    I: 'I',
    O: 'O',
    U: 'U',
    S: 'I',
  }

  const smoothState: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
  const ATTACK = 50 // the speed moving to the next mouth shape animation
  const RELEASE = 30 // the speed ending the current mouth shape animation
  const CAP = 0.7
  const SILENCE_VOL = 0.04
  const SILENCE_GAIN = 0.05
  const IDLE_MS = 160
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

  function update(vrm?: VRMCore, delta = 0.016) {
    const node = lipSyncNode.value
    if (!vrm?.expressionManager || !node)
      return

    const vol = node.volume ?? 0
    const amp = Math.min(vol * 0.9, 1) ** 0.7

    // Remapping wLipSync output AEIOUS to AEIOU
    const projected: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
    for (const raw of RAW_KEYS) {
      const lip = RAW_TO_LIP[raw]
      const rawVal = node.weights[raw] ?? 0
      projected[lip] = Math.max(projected[lip], rawVal * amp)
    }

    // winner + runner
    // Original code: all AEIOU mouth shape blended together. Because the A mouth shape has the largest deformation, mixing A-E-I-O-U based on their raw weights causes the combined result to be biased heavily toward A in most cases.
    // Improved code: Only the 2 mouth shapes with the largest weights will be blended.
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

    // Detect pause or keep silence
    const now = performance.now()
    let silent = amp < SILENCE_VOL || winnerVal < SILENCE_GAIN
    if (!silent)
      lastActiveAt = now
    if (now - lastActiveAt > IDLE_MS)
      silent = true

    // winner + runner weights
    const target: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
    if (!silent) {
      target[winner] = Math.min(CAP, winnerVal)
      target[runner] = Math.min(CAP * 0.5, runnerVal * 0.6)
    }

    // smoothness and expression generation
    for (const key of LIP_KEYS) {
      const from = smoothState[key]
      const to = target[key]
      // lerp
      const rate = 1 - Math.exp(-(to > from ? ATTACK : RELEASE) * delta)
      smoothState[key] = from + (to - from) * rate
      const weight = (smoothState[key] <= 0.01 ? 0 : smoothState[key]) * 0.7
      vrm.expressionManager.setValue(BLENDSHAPE_MAP[key], weight)
    }
  }

  return { update }
}
